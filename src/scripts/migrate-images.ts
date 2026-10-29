/**
 * Sube a Cloudinary las fotos sembradas que hoy sirve el frontapp (/products/*.webp)
 * y reemplaza su url en cada pieza. Solo agrega y actualiza: no borra nada.
 * Cada pieza recibe su propia copia del archivo, porque al quitar una foto desde
 * el panel se borra de Cloudinary y no debe romper a otra pieza que la comparta.
 * Uso: pnpm migrate:images  (lee las fotos de ../mayumy-chang-frontapp/public)
 */
import path from "node:path";
import fs from "node:fs";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { dbConnect } from "../config/mongo";
import { Product } from "../models/product.model";
import { PRODUCTS_IMAGE_FOLDER } from "../config/store";

const PUBLIC_DIR = path.resolve(__dirname, "../../../mayumy-chang-frontapp/public");

async function main() {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  await dbConnect();

  const products = await Product.find({ "images.publicId": "" });
  let uploaded = 0;
  for (const product of products) {
    for (const image of product.images) {
      if (image.publicId || !image.url.startsWith("/")) continue;
      const file = path.join(PUBLIC_DIR, image.url);
      if (!fs.existsSync(file)) {
        console.warn(`No existe ${file}; se deja como está`);
        continue;
      }
      const base = path.basename(image.url, path.extname(image.url));
      const result = await cloudinary.uploader.upload(file, {
        folder: PRODUCTS_IMAGE_FOLDER,
        public_id: `${product.slug}--${base}`,
        overwrite: false,
        resource_type: "image",
      });
      image.url = result.secure_url;
      image.publicId = result.public_id;
      uploaded += 1;
    }
    await product.save();
    console.log(`✓ ${product.name}`);
  }
  console.log(`Listo: ${uploaded} fotos subidas en ${products.length} piezas.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
