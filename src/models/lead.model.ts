import mongoose, { Schema } from "mongoose";
import { LEAD_KINDS, LEAD_STATUSES, LeadKind, LeadStatus } from "../config/store";

/** Lista de espera de Galápagos y solicitudes de diseño a medida. */
export interface ILead {
  kind: LeadKind;
  name: string;
  email: string;
  phone: string;
  message: string;
  // Solo bespoke, texto libre ("$1.000–$2.000").
  budget: string;
  status: LeadStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const leadSchema = new Schema<ILead>(
  {
    kind: { type: String, enum: LEAD_KINDS, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: "", trim: true },
    message: { type: String, default: "", trim: true },
    budget: { type: String, default: "", trim: true },
    status: { type: String, enum: LEAD_STATUSES, default: "new", index: true },
  },
  { timestamps: true },
);

leadSchema.index({ createdAt: -1 });

export const Lead =
  (mongoose.models.Lead as mongoose.Model<ILead>) || mongoose.model<ILead>("Lead", leadSchema);
