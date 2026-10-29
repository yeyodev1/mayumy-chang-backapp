/**
 * Carga el catálogo inicial de Mayumy Chang (categorías y piezas).
 * Idempotente: hace upsert por slug y nunca borra nada. Al re-ejecutarlo
 * restaura los campos del seed (incluido el stock) en las piezas existentes,
 * conserva el _id de la variante para no romper carritos y no toca las
 * imágenes que el panel ya subió a Cloudinary.
 * Uso: pnpm seed:products
 */
import mongoose from "mongoose";
import { dbConnect } from "../config/mongo";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { slugify } from "../utils/slugify";
import seed from "./data/products.seed.json";

interface SeedCategory {
  slug: string;
  name: string;
  blurb: string;
  order: number;
}

interface SeedProduct {
  name: string;
  segment: string;
  category: string;
  line?: string;
  stone?: string;
  material?: string;
  shortDescription?: string;
  description?: string;
  details?: string[];
  images?: string[];
  priceCents: number;
  stock: number;
  compareAtPriceCents?: number;
  keepVisibleWhenSoldOut?: boolean;
  isBestSeller?: boolean;
  isPieceOfMonth?: boolean;
  isFeatured?: boolean;
  order?: number;
}

// El frontapp sirve las fotos sembradas en /products/<nombre>.webp.
function seedImage(name: string) {
  return { url: `/products/${name}.webp`, publicId: "" };
}

async function seedCategories(categories: SeedCategory[]) {
  const result = await Category.bulkWrite(
    categories.map((c) => ({
      updateOne: {
        filter: { slug: slugify(c.slug) },
        update: {
          $set: { name: c.name, blurb: c.blurb, order: c.order },
          $setOnInsert: { slug: slugify(c.slug), isVisible: true },
        },
        upsert: true,
      },
    })),
  );
  console.log(
    `Categorías · nuevas: ${result.upsertedCount} · actualizadas: ${result.modifiedCount}`,
  );
}

async function seedProducts(products: SeedProduct[]) {
  let created = 0;
  let updated = 0;

  for (const raw of products) {
    const slug = slugify(raw.name);
    const existing = await Product.findOne({ slug });
    const product = existing ?? new Product({ slug });

    const keepUploaded = product.images.some((img) => img.publicId);
    product.set({
      name: raw.name,
      segment: raw.segment,
      category: slugify(raw.category),
      line: raw.line ?? "",
      stone: raw.stone ?? "ninguna",
      material: raw.material ?? "",
      shortDescription: raw.shortDescription ?? "",
      description: raw.description ?? "",
      details: raw.details ?? [],
      compareAtPriceCents: raw.compareAtPriceCents ?? 0,
      keepVisibleWhenSoldOut: raw.keepVisibleWhenSoldOut ?? true,
      isBestSeller: raw.isBestSeller ?? false,
      isPieceOfMonth: raw.isPieceOfMonth ?? false,
      isFeatured: raw.isFeatured ?? false,
      isPublished: true,
      order: raw.order ?? 0,
      variants: [
        {
          ...(product.variants[0]?._id ? { _id: product.variants[0]._id } : {}),
          label: "Única",
          priceCents: raw.priceCents,
          stock: raw.stock,
        },
      ],
      ...(keepUploaded ? {} : { images: (raw.images ?? []).map(seedImage) }),
    });

    // save() y no updateOne: corren los derivados y la regla de pieza del mes.
    await product.save();
    if (existing) updated++;
    else created++;
    console.log(`${existing ? "↻" : "✔"} ${slug} · stock ${raw.stock}`);
  }

  console.log(`Piezas · nuevas: ${created} · actualizadas: ${updated}`);
}

async function main() {
  await dbConnect();
  const data = seed as { categories: SeedCategory[]; products: SeedProduct[] };
  await seedCategories(data.categories);
  await seedProducts(data.products);
  const total = await Product.countDocuments();
  console.log(`Total de piezas en la base: ${total}`);
}

main()
  .catch((error) => {
    console.error("✖ Falló el seed de productos:", error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
