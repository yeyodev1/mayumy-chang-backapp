import mongoose, { Schema, Types } from "mongoose";
import {
  DELIVERY_METHODS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  SHIPPING_ZONES,
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  ShippingZone,
} from "../config/store";

export interface IOrderItem {
  product: Types.ObjectId;
  slug: string;
  name: string;
  image: string;
  variantId: string;
  variantLabel: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface IOrderPayphone {
  transactionId: number | null;
  statusCode: number | null;
  authorizationCode: string;
  cardBrand: string;
  lastDigits: string;
  raw: unknown;
}

export interface IOrder {
  code: string;
  user: Types.ObjectId | null;
  customer: { name: string; email: string; phone: string; documentId: string };
  delivery: {
    method: DeliveryMethod;
    province: string;
    city: string;
    address: string;
    reference: string;
    giftNote: string;
  };
  items: IOrderItem[];
  subtotalCents: number;
  shippingCents: number;
  shippingZone: ShippingZone;
  // Recargo (+) o descuento (−) del método de pago; ya va sumado en totalCents.
  paymentAdjustmentCents: number;
  paymentAdjustmentLabel: string;
  totalCents: number;
  notes: string;
  // Empaque de regalo, sin costo.
  isGift: boolean;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  clientTransactionId: string;
  payphone: IOrderPayphone;
  // Ya se devolvió el stock (canceled/failed): evita devolverlo dos veces.
  stockReleased: boolean;
  paidAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const itemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    variantId: { type: String, required: true },
    variantLabel: { type: String, required: true },
    unitPriceCents: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    code: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, required: true, trim: true },
      documentId: { type: String, required: true, trim: true },
    },
    delivery: {
      method: { type: String, enum: DELIVERY_METHODS, required: true },
      province: { type: String, default: "" },
      city: { type: String, default: "" },
      address: { type: String, default: "" },
      reference: { type: String, default: "" },
      giftNote: { type: String, default: "" },
    },
    items: { type: [itemSchema], required: true },
    subtotalCents: { type: Number, required: true, min: 0 },
    shippingCents: { type: Number, required: true, min: 0 },
    shippingZone: { type: String, enum: SHIPPING_ZONES, default: "local" },
    paymentAdjustmentCents: { type: Number, default: 0 },
    paymentAdjustmentLabel: { type: String, default: "" },
    totalCents: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" },
    isGift: { type: Boolean, default: false },
    status: { type: String, enum: ORDER_STATUSES, default: "pending", index: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "card" },
    clientTransactionId: { type: String, required: true, unique: true, index: true },
    payphone: {
      transactionId: { type: Number, default: null },
      statusCode: { type: Number, default: null },
      authorizationCode: { type: String, default: "" },
      cardBrand: { type: String, default: "" },
      lastDigits: { type: String, default: "" },
      raw: { type: Schema.Types.Mixed, default: null },
    },
    stockReleased: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ "customer.email": 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paidAt: -1 });

export const Order =
  (mongoose.models.Order as mongoose.Model<IOrder>) || mongoose.model<IOrder>("Order", orderSchema);
