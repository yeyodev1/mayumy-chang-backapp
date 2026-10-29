import { Types } from "mongoose";
import {
  ADJUSTMENT_KINDS,
  ADJUSTMENT_UNITS,
  BANK_ACCOUNT_TYPES,
  BANK_LOGOS_FOLDER,
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_BOOKING,
  DEFAULT_COLLAB,
  DEFAULT_CONTACT,
  DEFAULT_SHIPPING,
  MAX_BANK_ACCOUNTS,
  MAX_SHIPPING_CENTS,
  PAYMENT_METHODS,
  AdjustmentKind,
  AdjustmentUnit,
  BankAccountType,
  PaymentMethod,
  ShippingZone,
} from "../config/store";
import { CustomError } from "../errors/customError.error";
import {
  IBankAccount,
  IBookingSettings,
  ICollabSettings,
  IContactSettings,
  IPaymentAdjustment,
  IPaymentsSettings,
  IPickupPoint,
  IShippingSettings,
  StoreSettings,
} from "../models/storeSettings.model";
import { uploadBuffer } from "./cloudinary.service";
import { isPayphoneConfigured } from "./payphone.service";

const KEY = "store";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface StoreSettingsDTO {
  shipping: IShippingSettings;
  booking: IBookingSettings;
  contact: IContactSettings;
  collab: ICollabSettings;
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Sin tildes ni mayúsculas: "Guayaquil" y "guayaquíl " cuentan como la misma ciudad. */
export function normalizeCity(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Si nadie guardó ajustes todavía, rigen los valores por defecto del código. */
export async function getSettings(): Promise<StoreSettingsDTO> {
  const doc = await StoreSettings.findOne({ key: KEY }).lean();
  const shipping = doc?.shipping;
  return {
    shipping: shipping
      ? {
          baseCity: shipping.baseCity || DEFAULT_SHIPPING.baseCity,
          localCents: shipping.localCents ?? DEFAULT_SHIPPING.localCents,
          nationalCents: shipping.nationalCents ?? DEFAULT_SHIPPING.nationalCents,
          freeFromCents: shipping.freeFromCents ?? 0,
          pickupEnabled: shipping.pickupEnabled !== false,
          pickup: { ...DEFAULT_SHIPPING.pickup, ...shipping.pickup },
        }
      : { ...DEFAULT_SHIPPING, pickup: { ...DEFAULT_SHIPPING.pickup } },
    booking: { ...DEFAULT_BOOKING, ...doc?.booking },
    contact: { ...DEFAULT_CONTACT, ...doc?.contact },
    collab: { ...DEFAULT_COLLAB, ...doc?.collab },
  };
}

function parseCents(value: unknown, label: string): number {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_SHIPPING_CENTS) {
    throw new CustomError(
      `${label} debe ir en centavos enteros, entre 0 y ${MAX_SHIPPING_CENTS}`,
      400,
    );
  }
  return cents;
}

function parseUrl(value: unknown, label: string): string {
  const url = str(value, 500);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
  } catch {
    throw new CustomError(`${label} debe ser un enlace que empiece con http:// o https://`, 400);
  }
  return url;
}

function parseShipping(raw: any, current: IShippingSettings): IShippingSettings {
  if (raw === undefined) return current;
  const pickup: IPickupPoint = {
    name: str(raw?.pickup?.name, 80),
    address: str(raw?.pickup?.address, 200),
    city: str(raw?.pickup?.city, 60),
    hours: str(raw?.pickup?.hours, 120),
  };
  const shipping: IShippingSettings = {
    baseCity: str(raw?.baseCity, 60),
    localCents: parseCents(raw?.localCents, "El envío local"),
    nationalCents: parseCents(raw?.nationalCents, "El envío nacional"),
    freeFromCents: parseCents(raw?.freeFromCents ?? 0, "El envío gratis desde"),
    pickupEnabled: raw?.pickupEnabled !== false,
    pickup,
  };
  if (!shipping.baseCity) throw new CustomError("Escribe la ciudad base del envío", 400);
  if (shipping.pickupEnabled) {
    if (!pickup.name) throw new CustomError("Escribe el nombre del punto de retiro", 400);
    if (!pickup.address) throw new CustomError("Escribe la dirección del punto de retiro", 400);
    if (!pickup.city) throw new CustomError("Escribe la ciudad del punto de retiro", 400);
  }
  return shipping;
}

function parseBooking(raw: any, current: IBookingSettings): IBookingSettings {
  if (raw === undefined) return current;
  return {
    url: parseUrl(raw?.url, "El enlace de citas"),
    label: str(raw?.label, 60) || DEFAULT_BOOKING.label,
  };
}

function parseContact(raw: any, current: IContactSettings): IContactSettings {
  if (raw === undefined) return current;
  const whatsapp = str(raw?.whatsapp, 20).replace(/[^\d]/g, "");
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) {
    throw new CustomError(
      "El WhatsApp debe ir con código de país, solo números (ej. 593985870627)",
      400,
    );
  }
  const email = str(raw?.email, 160).toLowerCase();
  if (email && !EMAIL.test(email)) throw new CustomError("Revisa el correo de contacto", 400);
  return {
    whatsapp,
    // Se acepta el enlace completo o el usuario (@mayumychang).
    instagram: str(raw?.instagram, 200),
    email,
    showroom: str(raw?.showroom, 200),
  };
}

function parseCollab(raw: any, current: ICollabSettings): ICollabSettings {
  if (raw === undefined) return current;
  const collab: ICollabSettings = {
    enabled: raw?.enabled === true,
    eyebrow: str(raw?.eyebrow, 80),
    title: str(raw?.title, 80),
    subtitle: str(raw?.subtitle, 300),
    release: str(raw?.release, 40),
  };
  if (collab.enabled && !collab.title) {
    throw new CustomError("Ponle un título a la colección antes de mostrarla", 400);
  }
  return collab;
}

/** PUT parcial por bloque: lo que no viene en el body queda como está. */
export async function updateSettings(input: any): Promise<StoreSettingsDTO> {
  const current = await getSettings();
  const next: StoreSettingsDTO = {
    shipping: parseShipping(input?.shipping, current.shipping),
    booking: parseBooking(input?.booking, current.booking),
    contact: parseContact(input?.contact, current.contact),
    collab: parseCollab(input?.collab, current.collab),
  };
  await StoreSettings.findOneAndUpdate(
    { key: KEY },
    { $set: next },
    { upsert: true, new: true, runValidators: true },
  );
  return getSettings();
}

/** Texto del punto de retiro tal como se guarda en el pedido y sale en los correos. */
export function pickupLabel(p: IPickupPoint): string {
  return [p.name, p.address].filter(Boolean).join(", ");
}

export interface ShippingQuote {
  shippingCents: number;
  shippingZone: ShippingZone;
}

/** Servientrega: pickup gratis, envío gratis desde X, ciudad base = local, el resto = nacional. */
export function quoteShipping(
  shipping: IShippingSettings,
  method: string,
  city: string,
  subtotalCents: number,
): ShippingQuote {
  if (method === "pickup") return { shippingCents: 0, shippingZone: "pickup" };
  if (shipping.freeFromCents > 0 && subtotalCents >= shipping.freeFromCents) {
    return { shippingCents: 0, shippingZone: "free" };
  }
  if (normalizeCity(city) === normalizeCity(shipping.baseCity)) {
    return { shippingCents: shipping.localCents, shippingZone: "local" };
  }
  return { shippingCents: shipping.nationalCents, shippingZone: "national" };
}

// ---------------- Pagos ----------------

export interface BankAccountDTO extends Omit<IBankAccount, "_id"> {
  id: string;
}

export interface PaymentSettingsDTO {
  payments: IPaymentsSettings;
  bankAccounts: BankAccountDTO[];
}

const MAX_PERCENT = 50;
const MAX_FIXED_CENTS = 100000;

const NO_ADJUSTMENT: IPaymentAdjustment = { kind: "none", unit: "percent", value: 0, label: "" };

const DEFAULT_LABELS: Record<PaymentMethod, Record<"surcharge" | "discount", string>> = {
  card: { surcharge: "Recargo por pago con tarjeta", discount: "Descuento por pago con tarjeta" },
  transfer: { surcharge: "Recargo por transferencia", discount: "Descuento por transferencia" },
};

function defaultPayments(): IPaymentsSettings {
  return {
    card: {
      enabled: true,
      title: "Tarjeta",
      description: "Débito o crédito, en línea con Payphone",
      adjustment: { ...NO_ADJUSTMENT },
    },
    transfer: {
      enabled: true,
      title: "Transferencia",
      description: "Desde tu banco, antes del despacho",
      adjustment: { ...NO_ADJUSTMENT },
    },
  };
}

/**
 * La primera vez que alguien pide los pagos se guardan los valores iniciales en
 * la BD: desde ahí todo se decide en el panel y no depende del código.
 */
async function ensurePaymentsSaved() {
  const doc = await StoreSettings.findOne({ key: KEY }, { payments: 1 }).lean();
  if (doc?.payments) return;
  const initial = { payments: defaultPayments(), bankAccounts: DEFAULT_BANK_ACCOUNTS };
  try {
    if (doc) {
      // El filtro evita pisar lo que otra request haya guardado entre medio.
      await StoreSettings.updateOne(
        { _id: doc._id, payments: { $exists: false } },
        { $set: initial },
      );
    } else {
      await StoreSettings.create({ key: KEY, ...initial });
    }
  } catch (error: any) {
    // Dos requests a la vez: la otra ya creó el documento.
    if (error?.code !== 11000) throw error;
  }
}

export async function getPaymentSettings(): Promise<PaymentSettingsDTO> {
  await ensurePaymentsSaved();
  const doc = await StoreSettings.findOne({ key: KEY }).lean();
  const payments = defaultPayments();
  for (const method of PAYMENT_METHODS) {
    const saved = doc?.payments?.[method];
    if (!saved) continue;
    payments[method] = {
      enabled: saved.enabled === true,
      title: saved.title || payments[method].title,
      description: saved.description || payments[method].description,
      adjustment: { ...NO_ADJUSTMENT, ...saved.adjustment },
    };
  }
  const accounts = doc?.bankAccounts ?? [];
  return {
    payments,
    bankAccounts: accounts.map((a, i) => ({
      id: a._id?.toString() ?? `default-${i}`,
      bank: a.bank,
      logoUrl: a.logoUrl,
      accountType: a.accountType,
      holder: a.holder,
      number: a.number,
      documentId: a.documentId,
      email: a.email,
      isActive: a.isActive,
    })),
  };
}

function parseAdjustment(raw: any, method: PaymentMethod): IPaymentAdjustment {
  const kind = String(raw?.kind ?? "none") as AdjustmentKind;
  if (!(ADJUSTMENT_KINDS as readonly string[]).includes(kind)) {
    throw new CustomError("Valor especial inválido", 400);
  }
  if (kind === "none") return { ...NO_ADJUSTMENT };
  const unit = String(raw?.unit ?? "percent") as AdjustmentUnit;
  if (!(ADJUSTMENT_UNITS as readonly string[]).includes(unit)) {
    throw new CustomError("Elige si el valor especial es en % o en dólares", 400);
  }
  const value = Number(raw?.value);
  if (unit === "percent") {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_PERCENT) {
      throw new CustomError(`El porcentaje debe estar entre 0,01 y ${MAX_PERCENT}`, 400);
    }
  } else if (!Number.isInteger(value) || value <= 0 || value > MAX_FIXED_CENTS) {
    throw new CustomError("El valor en dólares debe ser mayor a $0 y menor a $1.000", 400);
  }
  return {
    kind,
    unit,
    value: unit === "percent" ? Math.round(value * 100) / 100 : value,
    label: str(raw?.label, 60) || DEFAULT_LABELS[method][kind],
  };
}

function parseBankAccount(raw: any): IBankAccount {
  const accountType = String(raw?.accountType ?? "corriente") as BankAccountType;
  const account: IBankAccount = {
    bank: str(raw?.bank, 60),
    logoUrl: str(raw?.logoUrl, 500),
    accountType,
    holder: str(raw?.holder, 100),
    number: str(raw?.number, 30),
    documentId: str(raw?.documentId, 13),
    email: str(raw?.email, 160).toLowerCase(),
    isActive: raw?.isActive !== false,
  };
  if (!account.bank) throw new CustomError("Escribe el nombre del banco", 400);
  if (!(BANK_ACCOUNT_TYPES as readonly string[]).includes(accountType)) {
    throw new CustomError(`Tipo de cuenta inválido en ${account.bank}`, 400);
  }
  if (!account.holder)
    throw new CustomError(`Escribe el titular de la cuenta de ${account.bank}`, 400);
  if (!/^[\d-]{4,30}$/.test(account.number)) {
    throw new CustomError(`Revisa el número de cuenta de ${account.bank}: solo números`, 400);
  }
  if (account.documentId && !/^\d{10}(\d{3})?$/.test(account.documentId)) {
    throw new CustomError(`La cédula o RUC de ${account.bank} debe tener 10 o 13 dígitos`, 400);
  }
  if (account.email && !EMAIL.test(account.email)) {
    throw new CustomError(`Revisa el correo de ${account.bank}`, 400);
  }
  if (account.logoUrl && !/^(https:\/\/|\/)/.test(account.logoUrl)) {
    throw new CustomError(`El logo de ${account.bank} no es válido`, 400);
  }
  const id = String(raw?.id ?? "");
  if (Types.ObjectId.isValid(id)) account._id = new Types.ObjectId(id);
  return account;
}

export async function updatePaymentSettings(input: any): Promise<PaymentSettingsDTO> {
  const payments = defaultPayments();
  for (const method of PAYMENT_METHODS) {
    const raw = input?.payments?.[method];
    payments[method] = {
      enabled: raw?.enabled === true,
      // Vacío = vuelve al nombre de siempre, para que el checkout nunca muestre una opción sin nombre.
      title: str(raw?.title, 40) || payments[method].title,
      description: str(raw?.description, 120) || payments[method].description,
      adjustment: parseAdjustment(raw?.adjustment, method),
    };
  }
  if (!PAYMENT_METHODS.some((m) => payments[m].enabled)) {
    throw new CustomError("Deja al menos un método de pago activo", 400);
  }

  const rawAccounts: unknown[] = Array.isArray(input?.bankAccounts) ? input.bankAccounts : [];
  if (rawAccounts.length > MAX_BANK_ACCOUNTS) {
    throw new CustomError(`Máximo ${MAX_BANK_ACCOUNTS} cuentas`, 400);
  }
  const bankAccounts = rawAccounts.map(parseBankAccount);

  await StoreSettings.findOneAndUpdate(
    { key: KEY },
    { $set: { payments, bankAccounts } },
    { upsert: true, new: true, runValidators: true },
  );
  return getPaymentSettings();
}

export async function uploadBankLogo(
  file: Express.Multer.File | undefined,
): Promise<{ url: string }> {
  if (!file) throw new CustomError("Envía la imagen en el campo image", 400);
  if (!file.mimetype.startsWith("image/"))
    throw new CustomError("El archivo debe ser una imagen", 400);
  const { url } = await uploadBuffer(file.buffer, BANK_LOGOS_FOLDER);
  return { url };
}

/** Lo que ve el checkout: métodos que de verdad se pueden usar y solo cuentas activas. */
export async function getPublicPayments() {
  const { payments, bankAccounts } = await getPaymentSettings();
  const accounts = bankAccounts
    .filter((a) => a.isActive)
    .map(({ isActive: _active, ...rest }) => rest);
  return {
    payments: {
      ...payments,
      // Sin token de Payphone la tarjeta no se ofrece (POST /orders igual responde 503).
      card: { ...payments.card, enabled: payments.card.enabled && isPayphoneConfigured() },
      // Sin cuentas cargadas la transferencia sigue activa: el correo avisa que
      // el equipo enviará los datos por su lado.
      transfer: { ...payments.transfer },
    },
    bankAccounts: accounts,
  };
}

/**
 * Recargo (positivo) o descuento (negativo) en centavos sobre subtotal + envío.
 * El frontapp hace el mismo cálculo para mostrar el total antes de pagar.
 */
export function adjustmentCents(adjustment: IPaymentAdjustment, baseCents: number): number {
  if (adjustment.kind === "none" || !adjustment.value) return 0;
  const amount =
    adjustment.unit === "percent"
      ? Math.round((baseCents * adjustment.value) / 100)
      : Math.round(adjustment.value);
  return adjustment.kind === "discount" ? -Math.min(amount, baseCents) : amount;
}

/** GET /store/config: todo lo público en una sola llamada. */
export async function getPublicConfig() {
  const [settings, { payments, bankAccounts }] = await Promise.all([
    getSettings(),
    getPublicPayments(),
  ]);
  return { ...settings, payments, bankAccounts };
}
