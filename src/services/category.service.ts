import { Types } from "mongoose";
import { SEGMENTS, Segment } from "../config/store";
import { CustomError } from "../errors/customError.error";
import { Category, ICategory } from "../models/category.model";
import { Product } from "../models/product.model";
import { slugify } from "../utils/slugify";

const SORT = { order: 1, createdAt: 1 } as const;

/** Visibles, en orden, con cuántas piezas visibles tiene cada segmento. */
export async function listPublic() {
  const [categories, counts] = await Promise.all([
    Category.find({ isVisible: true }).sort(SORT).lean(),
    Product.aggregate<{ _id: { category: string; segment: Segment }; count: number }>([
      {
        $match: {
          isPublished: true,
          $or: [{ isAvailable: true }, { keepVisibleWhenSoldOut: true }],
        },
      },
      { $group: { _id: { category: "$category", segment: "$segment" }, count: { $sum: 1 } } },
    ]),
  ]);
  const emptyCounts = () =>
    Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<Segment, number>;
  const bySlug = new Map<string, Record<Segment, number>>();
  for (const row of counts) {
    const entry = bySlug.get(row._id.category) ?? emptyCounts();
    if (row._id.segment in entry) entry[row._id.segment] = row.count;
    bySlug.set(row._id.category, entry);
  }
  return categories.map((c) => ({ ...c, counts: bySlug.get(c.slug) ?? emptyCounts() }));
}

export async function listAdmin() {
  const [categories, counts] = await Promise.all([
    Category.find().sort(SORT).lean(),
    Product.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);
  const bySlug = new Map(counts.map((c) => [c._id, c.count]));
  return categories.map((c) => ({ ...c, productCount: bySlug.get(c.slug) ?? 0 }));
}

/** Para validar productos: la categoría tiene que existir (aunque esté oculta). */
export async function assertExists(slug: string) {
  if (!(await Category.exists({ slug }))) throw new CustomError("Esa categoría no existe", 400);
}

function pickFields(body: Record<string, unknown>) {
  const data: Partial<ICategory> = {};
  if (body.name !== undefined) {
    data.name = String(body.name).trim();
    if (data.name.length < 2) throw new CustomError("Ponle un nombre a la categoría", 400);
  }
  if (body.blurb !== undefined) data.blurb = String(body.blurb).trim().slice(0, 160);
  if (body.isVisible !== undefined) data.isVisible = body.isVisible !== false;
  return data;
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base).replace(/^-+|-+$/g, "") || "categoria";
  let candidate = root;
  let n = 2;
  while (await Category.exists({ slug: candidate })) candidate = `${root}-${n++}`;
  return candidate;
}

async function findById(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new CustomError("Categoría no encontrada", 404);
  const category = await Category.findById(id);
  if (!category) throw new CustomError("Categoría no encontrada", 404);
  return category;
}

export async function create(body: Record<string, unknown>) {
  const data = pickFields(body);
  if (!data.name) throw new CustomError("Ponle un nombre a la categoría", 400);
  const last = await Category.findOne().sort({ order: -1 }).select("order").lean();
  return Category.create({
    ...data,
    slug: await uniqueSlug(data.name),
    order: (last?.order ?? -1) + 1,
  });
}

export async function update(id: string, body: Record<string, unknown>) {
  const category = await findById(id);
  category.set(pickFields(body));
  await category.save();
  return category;
}

/** body: { ids } en el orden nuevo. */
export async function reorder(ids: unknown) {
  if (!Array.isArray(ids) || !ids.every((id) => Types.ObjectId.isValid(String(id)))) {
    throw new CustomError("Orden inválido", 400);
  }
  await Category.bulkWrite(
    ids.map((id, i) => ({
      updateOne: { filter: { _id: String(id) }, update: { $set: { order: i } } },
    })),
  );
  return listAdmin();
}

export async function remove(id: string) {
  const category = await findById(id);
  const inUse = await Product.countDocuments({ category: category.slug });
  if (inUse) {
    throw new CustomError(
      `Tiene ${inUse} pieza${inUse === 1 ? "" : "s"}: pásalas a otra categoría antes de borrarla`,
      409,
    );
  }
  await category.deleteOne();
  return { ok: true };
}
