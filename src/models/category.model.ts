import mongoose, { Schema } from "mongoose";

export interface ICategory {
  slug: string;
  name: string;
  blurb: string;
  order: number;
  isVisible: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    // El slug no cambia después de crearla: vive en las URLs de la tienda y en cada producto.
    slug: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    blurb: { type: String, default: "", trim: true },
    order: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.index({ isVisible: 1, order: 1 });

export const Category =
  (mongoose.models.Category as mongoose.Model<ICategory>) ||
  mongoose.model<ICategory>("Category", categorySchema);
