import mongoose, { Schema, Types } from "mongoose";
import {
  ADJUSTMENT_KINDS,
  ADJUSTMENT_UNITS,
  BANK_ACCOUNT_TYPES,
  AdjustmentKind,
  AdjustmentUnit,
  BankAccountType,
} from "../config/store";

export interface IPickupPoint {
  name: string;
  address: string;
  city: string;
  hours: string;
}

/** Envío por Servientrega: tarifa local (ciudad base) o nacional. */
export interface IShippingSettings {
  baseCity: string;
  localCents: number;
  nationalCents: number;
  // 0 = sin envío gratis.
  freeFromCents: number;
  pickupEnabled: boolean;
  pickup: IPickupPoint;
}

export interface IBookingSettings {
  url: string;
  label: string;
}

export interface IContactSettings {
  whatsapp: string;
  instagram: string;
  email: string;
  showroom: string;
}

export interface ICollabSettings {
  enabled: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  release: string;
}

/** Recargo o descuento según cómo pague el cliente. value: % o centavos según unit. */
export interface IPaymentAdjustment {
  kind: AdjustmentKind;
  unit: AdjustmentUnit;
  value: number;
  label: string;
}

export interface IPaymentMethodSettings {
  enabled: boolean;
  // Nombre y descripción que ve el cliente en el checkout; se cambian desde el panel.
  title: string;
  description: string;
  adjustment: IPaymentAdjustment;
}

export interface IPaymentsSettings {
  card: IPaymentMethodSettings;
  transfer: IPaymentMethodSettings;
}

export interface IBankAccount {
  _id?: Types.ObjectId;
  bank: string;
  logoUrl: string;
  accountType: BankAccountType;
  holder: string;
  number: string;
  documentId: string;
  email: string;
  isActive: boolean;
}

/**
 * Ajustes de la tienda que se cambian desde el panel. Es un único documento
 * (key "store"). Los bloques sin default quedan undefined hasta que se guardan
 * y mientras tanto rigen los valores del código.
 */
export interface IStoreSettings {
  key: string;
  shipping?: IShippingSettings;
  booking?: IBookingSettings;
  contact?: IContactSettings;
  collab?: ICollabSettings;
  payments?: IPaymentsSettings;
  bankAccounts?: IBankAccount[];
  createdAt?: Date;
  updatedAt?: Date;
}

const pickupSchema = new Schema<IPickupPoint>(
  {
    name: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    hours: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const shippingSchema = new Schema<IShippingSettings>(
  {
    baseCity: { type: String, default: "", trim: true },
    localCents: { type: Number, default: 0, min: 0 },
    nationalCents: { type: Number, default: 0, min: 0 },
    freeFromCents: { type: Number, default: 0, min: 0 },
    pickupEnabled: { type: Boolean, default: true },
    pickup: { type: pickupSchema, default: () => ({}) },
  },
  { _id: false },
);

const bookingSchema = new Schema<IBookingSettings>(
  {
    url: { type: String, default: "", trim: true },
    label: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const contactSchema = new Schema<IContactSettings>(
  {
    whatsapp: { type: String, default: "", trim: true },
    instagram: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    showroom: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const collabSchema = new Schema<ICollabSettings>(
  {
    enabled: { type: Boolean, default: false },
    eyebrow: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },
    release: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const adjustmentSchema = new Schema<IPaymentAdjustment>(
  {
    kind: { type: String, enum: ADJUSTMENT_KINDS, default: "none" },
    unit: { type: String, enum: ADJUSTMENT_UNITS, default: "percent" },
    value: { type: Number, default: 0, min: 0 },
    label: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const methodSchema = new Schema<IPaymentMethodSettings>(
  {
    enabled: { type: Boolean, default: true },
    title: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    adjustment: { type: adjustmentSchema, default: () => ({}) },
  },
  { _id: false },
);

const paymentsSchema = new Schema<IPaymentsSettings>(
  {
    card: { type: methodSchema, default: () => ({}) },
    transfer: { type: methodSchema, default: () => ({}) },
  },
  { _id: false },
);

const bankAccountSchema = new Schema<IBankAccount>({
  bank: { type: String, required: true, trim: true },
  logoUrl: { type: String, default: "", trim: true },
  accountType: { type: String, enum: BANK_ACCOUNT_TYPES, default: "corriente" },
  holder: { type: String, required: true, trim: true },
  number: { type: String, required: true, trim: true },
  documentId: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true },
  isActive: { type: Boolean, default: true },
});

const storeSettingsSchema = new Schema<IStoreSettings>(
  {
    key: { type: String, required: true, unique: true, default: "store" },
    shipping: { type: shippingSchema, default: undefined },
    booking: { type: bookingSchema, default: undefined },
    contact: { type: contactSchema, default: undefined },
    collab: { type: collabSchema, default: undefined },
    payments: { type: paymentsSchema, default: undefined },
    bankAccounts: { type: [bankAccountSchema], default: undefined },
  },
  { timestamps: true },
);

export const StoreSettings =
  (mongoose.models.StoreSettings as mongoose.Model<IStoreSettings>) ||
  mongoose.model<IStoreSettings>("StoreSettings", storeSettingsSchema);
