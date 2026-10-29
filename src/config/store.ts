/**
 * Reglas comerciales de la tienda. Viven acá y no en .env porque son
 * decisiones de negocio versionadas, no secretos ni datos por ambiente.
 */

// Segmentos de la tienda: dentro de cada uno se navega por categorías.
export const SEGMENTS = ["oro-18k", "plata-925", "semijoyas"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const STONES = [
  "zafiro",
  "esmeralda",
  "cristal",
  "granate",
  "citrino",
  "perla",
  "ninguna",
] as const;
export type Stone = (typeof STONES)[number];

// Valores iniciales del envío (Servientrega). Mayumy los cambia desde el panel.
export const DEFAULT_SHIPPING = {
  baseCity: "Guayaquil",
  localCents: 400,
  nationalCents: 700,
  freeFromCents: 0,
  pickupEnabled: true,
  pickup: {
    name: "Showroom Mayumy Chang",
    address: "Guayaquil (con cita previa)",
    city: "Guayaquil",
    hours: "Lun a Sáb · con cita",
  },
};
export const MAX_SHIPPING_CENTS = 100000;

export const SHIPPING_ZONES = ["local", "national", "pickup", "free"] as const;
export type ShippingZone = (typeof SHIPPING_ZONES)[number];

export const DEFAULT_BOOKING = { url: "", label: "Agendar cita" };

export const DEFAULT_CONTACT = {
  whatsapp: "593985870627",
  instagram: "",
  email: "",
  showroom: "Guayaquil, Ecuador",
};

// Teaser de la colección Galápagos: la colaboración aún no se anuncia.
export const DEFAULT_COLLAB = {
  enabled: true,
  eyebrow: "Próximamente · Edición limitada",
  title: "Galápagos",
  subtitle:
    "Una colección de alta joyería nacida en el archipiélago. Piezas numeradas, hechas a mano.",
  release: "2027",
};

export const DELIVERY_METHODS = ["delivery", "pickup"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

// "card" se cobra en línea con Payphone; "transfer" es una transferencia antes
// del despacho a las cuentas de Ajustes → Pagos.
export const PAYMENT_METHODS = ["card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Valor especial por método de pago (p. ej. recargo por comisión de tarjeta o
// descuento por transferencia). "percent" en % y "fixed" en centavos.
export const ADJUSTMENT_KINDS = ["none", "surcharge", "discount"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
export const ADJUSTMENT_UNITS = ["percent", "fixed"] as const;
export type AdjustmentUnit = (typeof ADJUSTMENT_UNITS)[number];

export const BANK_ACCOUNT_TYPES = ["corriente", "ahorros"] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];
export const MAX_BANK_ACCOUNTS = 10;
export const BANK_LOGOS_FOLDER = "mayumy-chang/banks";

// Mayumy aún no envía sus cuentas: se cargan desde el panel (Ajustes → Pagos).
// Sin cuentas activas la transferencia no se ofrece en el checkout.
export const DEFAULT_BANK_ACCOUNTS: Array<{
  bank: string;
  logoUrl: string;
  accountType: BankAccountType;
  holder: string;
  number: string;
  documentId: string;
  email: string;
  isActive: boolean;
}> = [];

export const ORDER_STATUSES = [
  "pending",
  // Transferencia: el equipo confirma el pedido antes de prepararlo.
  "review",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "canceled",
  "failed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Estados que cuentan como venta cobrada en reportes y en el perfil del cliente.
export const PAID_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];
// Estados en los que la orden ya no retiene piezas: el stock vuelve a la tienda.
export const RELEASE_STOCK_STATUSES: OrderStatus[] = ["canceled", "failed"];

export const ORDER_CODE_PREFIX = "MC";

export const MIN_ITEM_QUANTITY = 1;
// Casi todo es pieza única: el límite real lo pone el stock.
export const MAX_ITEM_QUANTITY = 10;

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export const PRODUCTS_IMAGE_FOLDER = "mayumy-chang/products";

// Piezas con este stock total o menos salen en "Stock bajo" del panel.
export const LOW_STOCK_THRESHOLD = 1;
export const MAX_RELATED_PRODUCTS = 8;

export const LEAD_KINDS = ["waitlist", "bespoke"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];
export const LEAD_STATUSES = ["new", "contacted", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PAYMENT_CURRENCY = "USD";

export const BRAND_NAME = "Mayumy Chang";
