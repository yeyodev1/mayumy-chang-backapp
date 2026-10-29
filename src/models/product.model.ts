import mongoose, { Schema, Types } from "mongoose";
import { SEGMENTS, STONES, Segment, Stone } from "../config/store";

export interface IProductImage {
  url: string;
  // "" = imagen sembrada que sirve el frontapp (/products/x.webp), no vive en Cloudinary.
  publicId: string;
}

export interface IProductVariant {
  _id: Types.ObjectId;
  label: string;
  priceCents: number;
  stock: number;
  isAvailable: boolean;
}

export interface IProduct {
  slug: string;
  name: string;
  segment: Segment;
  // Slug de una Category (colección aparte, la administra el panel).
  category: string;
  line: string;
  stone: Stone;
  material: string;
  shortDescription: string;
  description: string;
  details: string[];
  badges: string[];
  images: IProductImage[];
  variants: IProductVariant[];
  priceFromCents: number;
  compareAtPriceCents: number;
  stockTotal: number;
  isAvailable: boolean;
  keepVisibleWhenSoldOut: boolean;
  isBestSeller: boolean;
  isPieceOfMonth: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const centsValidator = {
  validator: Number.isInteger,
  message: "El precio debe ir en centavos enteros",
};

const imageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

const variantSchema = new Schema<IProductVariant>({
  label: { type: String, required: true, trim: true },
  priceCents: { type: Number, required: true, min: 0, validate: centsValidator },
  stock: {
    type: Number,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: "El stock debe ser un número entero" },
  },
  // Derivado de stock: lo recalcula pre("validate") y el descuento atómico de pedidos.
  isAvailable: { type: Boolean, default: false },
});

const productSchema = new Schema<IProduct>(
  {
    slug: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    segment: { type: String, enum: SEGMENTS, required: true, index: true },
    category: { type: String, required: true, index: true, trim: true, lowercase: true },
    line: { type: String, default: "", trim: true },
    stone: { type: String, enum: STONES, default: "ninguna" },
    material: { type: String, default: "", trim: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },
    details: { type: [String], default: [] },
    badges: { type: [String], default: [] },
    images: { type: [imageSchema], default: [] },
    variants: {
      type: [variantSchema],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length > 0,
        message: "La pieza necesita al menos una variante",
      },
    },
    // Derivados en pre("validate"): se guardan para poder filtrar y ordenar en Mongo.
    priceFromCents: { type: Number, default: 0 },
    stockTotal: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: false },
    compareAtPriceCents: { type: Number, default: 0, min: 0, validate: centsValidator },
    // Agotada y visible da sensación de rotación; Mayumy decide pieza por pieza.
    keepVisibleWhenSoldOut: { type: Boolean, default: true },
    isBestSeller: { type: Boolean, default: false },
    isPieceOfMonth: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

productSchema.index({ isPublished: 1, isAvailable: -1, order: 1 });
productSchema.index({ isPieceOfMonth: 1 });

/** Mismas reglas que pre("validate"), para recalcular tras un $inc atómico de stock. */
export function deriveFromVariants(variants: Array<{ priceCents: number; stock: number }>) {
  const withStock = variants.filter((v) => v.stock > 0);
  const pool = withStock.length ? withStock : variants;
  return {
    priceFromCents: pool.length ? Math.min(...pool.map((v) => v.priceCents)) : 0,
    stockTotal: variants.reduce((sum, v) => sum + Math.max(0, v.stock || 0), 0),
    isAvailable: withStock.length > 0,
  };
}

/**
 * Precio "desde" = la variante con stock más barata; si todo está agotado,
 * la más barata de todas, para que la tarjeta no muestre $0.
 * Corre en validate (antes de save), así que solo se actualiza vía doc.save().
 */
productSchema.pre("validate", function (next) {
  const variants = this.variants || [];
  for (const v of variants) v.isAvailable = (v.stock || 0) > 0;
  const derived = deriveFromVariants(variants);
  this.priceFromCents = derived.priceFromCents;
  this.stockTotal = derived.stockTotal;
  this.isAvailable = derived.isAvailable;
  next();
});

/** Solo una pieza del mes a la vez: al marcar una se desmarcan las demás. */
productSchema.post("save", async function (doc) {
  if (!doc.isPieceOfMonth) return;
  await (doc.constructor as mongoose.Model<IProduct>).updateMany(
    { _id: { $ne: doc._id }, isPieceOfMonth: true },
    { $set: { isPieceOfMonth: false } },
  );
});

export const Product =
  (mongoose.models.Product as mongoose.Model<IProduct>) ||
  mongoose.model<IProduct>("Product", productSchema);
