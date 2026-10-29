import { FilterQuery, PipelineStage, Types } from "mongoose";
import {
  LOW_STOCK_THRESHOLD,
  MAX_RELATED_PRODUCTS,
  PRODUCTS_IMAGE_FOLDER,
  SEGMENTS,
  STONES,
} from "../config/store";
import { CustomError } from "../errors/customError.error";
import { IProduct, Product } from "../models/product.model";
import { deleteImage, uploadBuffer } from "./cloudinary.service";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { slugify } from "../utils/slugify";
import { assertExists as assertCategoryExists } from "./category.service";

export interface ProductListQuery {
  segment?: unknown;
  category?: unknown;
  stone?: unknown;
  line?: unknown;
  bestSeller?: unknown;
  featured?: unknown;
  search?: unknown;
  sort?: unknown;
  stock?: unknown;
  page?: unknown;
  limit?: unknown;
}

const SORTS = {
  order: { order: 1, createdAt: -1 },
  "price-asc": { priceFromCents: 1, order: 1 },
  "price-desc": { priceFromCents: -1, order: 1 },
  new: { createdAt: -1 },
} as const;
type SortKey = keyof typeof SORTS;

/** Lo que el público puede ver: publicada y con stock, o agotada pero marcada como visible. */
const PUBLIC_VISIBLE: FilterQuery<IProduct> = {
  isPublished: true,
  $or: [{ isAvailable: true }, { keepVisibleWhenSoldOut: true }],
};

function assertObjectId(id: string, message = "Producto no encontrado") {
  if (!Types.ObjectId.isValid(id)) throw new CustomError(message, 404);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTrue(value: unknown): boolean {
  return value === "true" || value === true;
}

function buildFilter(query: ProductListQuery, isPublic: boolean): FilterQuery<IProduct> {
  const and: FilterQuery<IProduct>[] = [];
  if (isPublic) and.push(PUBLIC_VISIBLE);

  const segment = text(query.segment).toLowerCase();
  if (segment) {
    if (!(SEGMENTS as readonly string[]).includes(segment)) {
      throw new CustomError("Segmento inválido", 400);
    }
    and.push({ segment });
  }

  // Una categoría que no existe simplemente no trae productos.
  const category = text(query.category).toLowerCase();
  if (category) and.push({ category });

  const stone = text(query.stone).toLowerCase();
  if (stone) {
    if (!(STONES as readonly string[]).includes(stone)) {
      throw new CustomError("Piedra inválida", 400);
    }
    and.push({ stone });
  }

  const line = text(query.line);
  if (line) and.push({ line: new RegExp(`^${escapeRegex(line)}$`, "i") });

  if (isTrue(query.bestSeller)) and.push({ isBestSeller: true });
  if (isTrue(query.featured)) and.push({ isFeatured: true });

  if (!isPublic) {
    const stock = text(query.stock);
    if (stock === "in") and.push({ isAvailable: true });
    else if (stock === "out") and.push({ isAvailable: false });
    else if (stock) throw new CustomError("Filtro de stock inválido (in u out)", 400);
  }

  const search = text(query.search);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    and.push({
      $or: [{ name: rx }, { shortDescription: rx }, { slug: rx }, { line: rx }, { material: rx }],
    });
  }

  return and.length ? { $and: and } : {};
}

function parseSort(raw: unknown): SortKey {
  const sort = text(raw) || "order";
  if (!(sort in SORTS)) throw new CustomError("Orden inválido", 400);
  return sort as SortKey;
}

export async function listPublic(query: ProductListQuery) {
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const filter = buildFilter(query, true);
  // Agotadas visibles al final: primero por disponibilidad, luego el orden pedido.
  const sort = { isAvailable: -1, ...SORTS[parseSort(query.sort)] } as Record<string, 1 | -1>;
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function listAdmin(query: ProductListQuery) {
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const filter = buildFilter(query, false);
  const sort = SORTS[parseSort(query.sort)] as Record<string, 1 | -1>;
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function getPublicBySlug(slug: string) {
  const product = await Product.findOne({
    $and: [{ slug: slug.toLowerCase() }, PUBLIC_VISIBLE],
  }).lean();
  if (!product) throw new CustomError("Producto no encontrado", 404);
  return product;
}

export async function getPieceOfMonth() {
  return Product.findOne({ $and: [{ isPieceOfMonth: true }, PUBLIC_VISIBLE] }).lean();
}

/** Misma línea, piedra o categoría, con stock. Primero lo más parecido. */
export async function getRelated(slug: string) {
  const product = await getPublicBySlug(slug);
  const or: FilterQuery<IProduct>[] = [{ category: product.category }];
  if (product.line) or.push({ line: product.line });
  if (product.stone && product.stone !== "ninguna") or.push({ stone: product.stone });

  const pipeline: PipelineStage[] = [
    {
      $match: { _id: { $ne: product._id }, isPublished: true, isAvailable: true, $or: or },
    },
    {
      $addFields: {
        _score: {
          $add: [
            { $cond: [{ $and: [!!product.line, { $eq: ["$line", product.line] }] }, 4, 0] },
            { $cond: [{ $eq: ["$stone", product.stone] }, 2, 0] },
            { $cond: [{ $eq: ["$category", product.category] }, 1, 0] },
          ],
        },
      },
    },
    { $sort: { _score: -1, order: 1 } },
    { $limit: MAX_RELATED_PRODUCTS },
    { $project: { _score: 0 } },
  ];
  return Product.aggregate(pipeline);
}

/** Para el panel: piezas publicadas que están por agotarse (o ya agotadas). */
export async function lowStock() {
  return Product.find({ isPublished: true, stockTotal: { $lte: LOW_STOCK_THRESHOLD } })
    .sort({ stockTotal: 1, order: 1 })
    .select("_id name slug stockTotal")
    .lean();
}

export async function getById(id: string) {
  assertObjectId(id);
  const product = await Product.findById(id);
  if (!product) throw new CustomError("Producto no encontrado", 404);
  return product;
}

// Campos que el admin puede escribir. images y los derivados los maneja el server.
const EDITABLE_FIELDS = [
  "name",
  "slug",
  "segment",
  "category",
  "line",
  "stone",
  "material",
  "shortDescription",
  "description",
  "details",
  "badges",
  "variants",
  "compareAtPriceCents",
  "keepVisibleWhenSoldOut",
  "isBestSeller",
  "isPieceOfMonth",
  "isFeatured",
  "isPublished",
  "order",
] as const;

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new CustomError(`${field} debe ser una lista`, 400);
  return value.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function nonNegativeInt(value: unknown, message: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new CustomError(message, 400);
  return n;
}

function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (data.slug !== undefined) data.slug = slugify(String(data.slug));
  if (data.category !== undefined) data.category = String(data.category).trim().toLowerCase();
  if (data.segment !== undefined) {
    data.segment = String(data.segment).trim().toLowerCase();
    if (!(SEGMENTS as readonly string[]).includes(data.segment as string)) {
      throw new CustomError("Elige un segmento: Oro 18K, Plata 925 o Semijoyas", 400);
    }
  }
  if (data.stone !== undefined) {
    data.stone = String(data.stone || "ninguna")
      .trim()
      .toLowerCase();
    if (!(STONES as readonly string[]).includes(data.stone as string)) {
      throw new CustomError("Piedra inválida", 400);
    }
  }
  if (data.details !== undefined) {
    data.details = stringList(data.details, "La ficha").map((d) => d.toUpperCase());
  }
  if (data.badges !== undefined) data.badges = stringList(data.badges, "Las etiquetas");
  if (data.compareAtPriceCents !== undefined) {
    data.compareAtPriceCents = nonNegativeInt(
      data.compareAtPriceCents,
      "El precio anterior debe ir en centavos enteros",
    );
  }
  for (const flag of [
    "keepVisibleWhenSoldOut",
    "isBestSeller",
    "isPieceOfMonth",
    "isFeatured",
    "isPublished",
  ]) {
    if (data[flag] !== undefined) data[flag] = data[flag] === true;
  }
  if (Array.isArray(data.variants)) {
    data.variants = (data.variants as Array<Record<string, unknown>>).map((v) => {
      const variant: Record<string, unknown> = {
        label: String(v.label ?? "").trim() || "Única",
        priceCents: nonNegativeInt(
          v.priceCents,
          "El precio de cada variante debe ir en centavos enteros",
        ),
        stock: nonNegativeInt(v.stock ?? 0, "El stock de cada variante debe ser un entero ≥ 0"),
      };
      // Conservar el _id mantiene válidos los carritos que ya apuntan a esa variante.
      if (v._id && Types.ObjectId.isValid(String(v._id))) variant._id = String(v._id);
      return variant;
    });
  } else if (data.variants !== undefined) {
    throw new CustomError("Las variantes deben ser una lista", 400);
  }
  return data;
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "pieza";
  let candidate = root;
  let n = 2;
  while (
    await Product.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
  ) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

export async function create(body: Record<string, unknown>) {
  const data = pickEditable(body);
  if (!data.name || !String(data.name).trim()) {
    throw new CustomError("La pieza necesita un nombre", 400);
  }
  if (!data.segment) throw new CustomError("Elige un segmento", 400);
  if (!data.category) throw new CustomError("Elige una categoría", 400);
  await assertCategoryExists(String(data.category));
  if (data.slug) {
    if (await Product.exists({ slug: data.slug })) {
      throw new CustomError("Ya existe una pieza con ese slug", 409);
    }
  } else {
    data.slug = await uniqueSlug(String(data.name));
  }
  const product = new Product(data);
  await product.save();
  return product;
}

export async function update(id: string, body: Record<string, unknown>) {
  const product = await getById(id);
  const data = pickEditable(body);
  if (data.category !== undefined) await assertCategoryExists(String(data.category));
  if (data.slug !== undefined) {
    if (!data.slug) throw new CustomError("El slug no puede quedar vacío", 400);
    if (await Product.exists({ slug: data.slug, _id: { $ne: product._id } })) {
      throw new CustomError("Ya existe una pieza con ese slug", 409);
    }
  }
  product.set(data);
  // save() y no findOneAndUpdate: así corre el pre-validate que recalcula precio y stock.
  await product.save();
  return product;
}

/** Ajuste rápido de stock desde el listado del panel. */
export async function updateStock(id: string, variantId: unknown, stockRaw: unknown) {
  const product = await getById(id);
  const stock = nonNegativeInt(stockRaw, "El stock debe ser un entero mayor o igual a 0");
  const variant = product.variants.find((v) => v._id.toString() === String(variantId ?? ""));
  if (!variant) throw new CustomError("Variante no encontrada", 404);
  variant.stock = stock;
  await product.save();
  return product;
}

export async function remove(id: string) {
  const product = await getById(id);
  const publicIds = product.images.map((img) => img.publicId).filter(Boolean);
  await product.deleteOne();
  // Si Cloudinary falla, el producto ya no existe: no vale la pena devolver error al admin.
  await Promise.allSettled(publicIds.map((pid) => deleteImage(pid)));
  return { ok: true };
}

export async function addImage(id: string, file: Express.Multer.File | undefined) {
  if (!file) throw new CustomError("Adjunta una imagen en el campo image", 400);
  if (!file.mimetype.startsWith("image/"))
    throw new CustomError("El archivo debe ser una imagen", 400);
  const product = await getById(id);
  const uploaded = await uploadBuffer(file.buffer, PRODUCTS_IMAGE_FOLDER);
  product.images.push(uploaded);
  await product.save();
  return product;
}

/**
 * El parámetro puede ser un publicId de Cloudinary o, para imágenes sembradas
 * (publicId ""), su url. Las sembradas solo se quitan del documento.
 */
export async function removeImage(id: string, key: string) {
  const product = await getById(id);
  const target = product.images.find(
    (img) => (img.publicId && img.publicId === key) || img.url === key,
  );
  if (!target) throw new CustomError("La imagen no pertenece a esta pieza", 404);
  product.images = product.images.filter((img) => img !== target);
  await product.save();
  if (target.publicId) {
    await deleteImage(target.publicId).catch((error) => {
      console.error("[product] no se pudo borrar la imagen de Cloudinary:", error);
    });
  }
  return product;
}

/** body: { urls } (sirve para todas) o { publicIds } (solo si todas están en Cloudinary). */
export async function reorderImages(id: string, body: { urls?: unknown; publicIds?: unknown }) {
  const product = await getById(id);
  const useUrls = Array.isArray(body.urls);
  const keys = useUrls ? body.urls : body.publicIds;
  if (!Array.isArray(keys)) throw new CustomError("Envía urls como lista", 400);
  const keyOf = (img: { url: string; publicId: string }) => (useUrls ? img.url : img.publicId);
  const current = product.images.map(keyOf);
  const sameSet =
    keys.length === current.length &&
    new Set(keys).size === keys.length &&
    current.every((k) => keys.includes(k));
  if (!sameSet) throw new CustomError("La lista debe incluir todas las imágenes de la pieza", 400);
  const byKey = new Map(
    product.images.map((img) => [keyOf(img), { url: img.url, publicId: img.publicId }]),
  );
  product.images = keys.map((k: string) => byKey.get(k)!);
  await product.save();
  return product;
}

// ---------------- Stock ----------------

export interface StockLine {
  productId: string;
  variantId: string;
  quantity: number;
  name: string;
}

/**
 * Recalcula los derivados (isAvailable de cada variante, stockTotal,
 * isAvailable, priceFromCents) dentro de Mongo, a partir del stock actual.
 * Es un update con pipeline para que dos pedidos simultáneos no se pisen
 * leyendo un stock viejo.
 */
async function syncDerived(productIds: string[]) {
  const ids = [...new Set(productIds)].map((id) => new Types.ObjectId(id));
  if (!ids.length) return;
  await Product.updateMany({ _id: { $in: ids } }, [
    {
      $set: {
        variants: {
          $map: {
            input: "$variants",
            as: "v",
            in: { $mergeObjects: ["$$v", { isAvailable: { $gt: ["$$v.stock", 0] } }] },
          },
        },
      },
    },
    {
      $set: {
        stockTotal: { $sum: "$variants.stock" },
        isAvailable: { $gt: [{ $sum: "$variants.stock" }, 0] },
        priceFromCents: {
          $let: {
            vars: { withStock: { $filter: { input: "$variants", cond: "$$this.isAvailable" } } },
            in: {
              $cond: [
                { $gt: [{ $size: "$$withStock" }, 0] },
                { $min: "$$withStock.priceCents" },
                { $ifNull: [{ $min: "$variants.priceCents" }, 0] },
              ],
            },
          },
        },
      },
    },
  ]);
}

async function incrementStock(lines: StockLine[], sign: 1 | -1) {
  await Promise.all(
    lines.map((line) =>
      Product.updateOne(
        { _id: line.productId, "variants._id": line.variantId },
        { $inc: { "variants.$.stock": sign * line.quantity } },
      ),
    ),
  );
  await syncDerived(lines.map((l) => l.productId));
}

/**
 * Descuenta stock de forma atómica, línea por línea. Si una no alcanza se
 * devuelve lo ya descontado y se responde 409 con el nombre de la pieza.
 */
export async function reserveStock(lines: StockLine[]) {
  const done: StockLine[] = [];
  try {
    for (const line of lines) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: line.productId,
          variants: {
            $elemMatch: { _id: new Types.ObjectId(line.variantId), stock: { $gte: line.quantity } },
          },
        },
        { $inc: { "variants.$.stock": -line.quantity } },
        { new: true, projection: { _id: 1 } },
      );
      if (!updated) throw new CustomError(`«${line.name}» se acaba de agotar`, 409);
      done.push(line);
    }
  } catch (error) {
    if (done.length) await incrementStock(done, 1);
    throw error;
  }
  await syncDerived(lines.map((l) => l.productId));
}

/** Devuelve el stock de un pedido cancelado o fallido. */
export async function releaseStock(lines: StockLine[]) {
  if (lines.length) await incrementStock(lines, 1);
}
