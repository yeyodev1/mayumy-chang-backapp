import crypto from "crypto";
import { FilterQuery, Types } from "mongoose";
import {
  DELIVERY_METHODS,
  MAX_ITEM_QUANTITY,
  MIN_ITEM_QUANTITY,
  ORDER_CODE_PREFIX,
  ORDER_STATUSES,
  OrderStatus,
  PAID_STATUSES,
  PAYMENT_CURRENCY,
  PAYMENT_METHODS,
  PaymentMethod,
  RELEASE_STOCK_STATUSES,
  BRAND_NAME,
} from "../config/store";
import { CustomError } from "../errors/customError.error";
import { IOrder, IOrderItem, Order } from "../models/order.model";
import { Product } from "../models/product.model";
import { sendEmail } from "./email.service";
import {
  orderConfirmedEmail,
  orderReceivedEmail,
  orderStatusEmail,
  orderTeamNotificationEmail,
} from "./mailTemplates";
import {
  confirmTransaction,
  getPayphonePublicConfig,
  isPayphoneConfigured,
  PAYPHONE_APPROVED,
  PAYPHONE_CANCELED,
  PayphoneConfirmation,
} from "./payphone.service";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { getOrderRecipients } from "./adminUser.service";
import {
  adjustmentCents,
  getPaymentSettings,
  getSettings,
  pickupLabel,
  quoteShipping,
} from "./storeSettings.service";
import { releaseStock, reserveStock, StockLine } from "./product.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Sin 0/O/1/I/L: el código se dicta por WhatsApp y no debe prestarse a confusión.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const MAX_ITEMS_PER_ORDER = 30;
// Un pago con tarjeta que no se confirma en este tiempo se da por abandonado
// y sus piezas vuelven a la tienda (casi todo es pieza única).
const CARD_RESERVATION_MS = 60 * 60 * 1000;

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

async function generateOrderCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${ORDER_CODE_PREFIX}-${randomCode(6)}`;
    if (!(await Order.exists({ code }))) return code;
  }
  throw new CustomError("No pudimos generar el código del pedido, intenta de nuevo", 500);
}

/** Único por intento de pago y de máximo 50 caracteres, como exige Payphone. */
function generateClientTransactionId(code: string): string {
  return `${code}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`.slice(0, 50);
}

/** Payphone espera el teléfono en formato internacional. */
function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("593")) return `+${digits}`;
  if (digits.startsWith("0")) return `+593${digits.slice(1)}`;
  return `+593${digits}`;
}

function str(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** La respuesta cruda de Payphone queda solo para el panel de admin. */
export function toPublicOrder(order: any) {
  const plain = typeof order?.toObject === "function" ? order.toObject() : { ...order };
  if (plain.payphone) plain.payphone = { ...plain.payphone, raw: undefined };
  return plain;
}

interface CreateOrderInput {
  items?: unknown;
  customer?: any;
  delivery?: any;
  notes?: unknown;
  isGift?: unknown;
  paymentMethod?: unknown;
}

function stockLines(order: { items: IOrderItem[] }): StockLine[] {
  return order.items.map((it) => ({
    productId: it.product.toString(),
    variantId: it.variantId,
    quantity: it.quantity,
    name: it.name,
  }));
}

/**
 * Devuelve el stock del pedido una sola vez: el flag stockReleased se voltea
 * de forma atómica y solo quien lo voltea devuelve las piezas.
 */
async function releaseOrderStock(orderId: unknown) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, stockReleased: false },
    { $set: { stockReleased: true } },
    { new: true },
  );
  if (order) await releaseStock(stockLines(order));
}

/**
 * Pagos con tarjeta abandonados: la cajita de Payphone se cerró y nadie
 * confirmó. Se pasan a failed para que la pieza vuelva a la tienda. Corre
 * de forma perezosa (al crear pedidos y en el panel) porque no hay cron.
 */
export async function expireStaleCardOrders() {
  const cutoff = new Date(Date.now() - CARD_RESERVATION_MS);
  const stale = await Order.find({
    status: "pending",
    paymentMethod: "card",
    stockReleased: false,
    createdAt: { $lt: cutoff },
  })
    .select("_id")
    .limit(20)
    .lean();
  for (const { _id } of stale) {
    const expired = await Order.findOneAndUpdate(
      { _id, status: "pending" },
      { $set: { status: "failed" } },
      { new: true },
    );
    if (expired) await releaseOrderStock(expired._id);
  }
}

/**
 * Un pedido nuevo de la misma clienta reemplaza sus intentos con tarjeta que
 * quedaron pendientes (cerró la cajita, volvió al checkout, reintentó). Sin
 * esto su propia reserva le bloquearía la pieza única con un 409. Si el intento
 * viejo al final sí se cobró, confirmOrder lo recupera como reserva vencida.
 */
async function releaseOwnPendingCardOrders(email: string) {
  const pending = await Order.find({
    "customer.email": email,
    status: "pending",
    paymentMethod: "card",
    stockReleased: false,
  })
    .select("_id")
    .limit(10)
    .lean();
  for (const { _id } of pending) {
    const superseded = await Order.findOneAndUpdate(
      { _id, status: "pending" },
      { $set: { status: "failed" } },
      { new: true },
    );
    if (superseded) await releaseOrderStock(superseded._id);
  }
}

export async function createOrder(input: CreateOrderInput, userId: string | null) {
  // ---- Validación de datos del comprador ----
  const customer = {
    name: str(input.customer?.name, 120),
    email: str(input.customer?.email, 160).toLowerCase(),
    phone: str(input.customer?.phone, 30),
    documentId: str(input.customer?.documentId, 20),
  };
  if (!customer.name) throw new CustomError("Escribe tu nombre", 400);
  if (!EMAIL.test(customer.email)) throw new CustomError("Escribe un correo válido", 400);
  if (customer.phone.replace(/\D/g, "").length < 7)
    throw new CustomError("Escribe un teléfono válido", 400);
  if (!/^\d{10}(\d{3})?$/.test(customer.documentId)) {
    throw new CustomError("Escribe una cédula (10 dígitos) o RUC (13 dígitos) válido", 400);
  }

  const paymentMethod = (str(input.paymentMethod, 20) || "card") as PaymentMethod;
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new CustomError("Elige cómo quieres pagar: tarjeta o transferencia", 400);
  }

  await releaseOwnPendingCardOrders(customer.email);

  const method = str(input.delivery?.method, 20);
  if (!(DELIVERY_METHODS as readonly string[]).includes(method)) {
    throw new CustomError("Elige envío a domicilio o retiro en el showroom", 400);
  }
  const delivery = {
    method: method as IOrder["delivery"]["method"],
    province: str(input.delivery?.province, 60),
    city: str(input.delivery?.city, 60),
    address: str(input.delivery?.address, 300),
    reference: str(input.delivery?.reference, 300),
    giftNote: str(input.delivery?.giftNote, 300),
  };
  const { shipping } = await getSettings();
  if (method === "delivery") {
    if (!delivery.province) throw new CustomError("Escribe la provincia de entrega", 400);
    if (!delivery.city) throw new CustomError("Escribe la ciudad de entrega", 400);
    if (!delivery.address) throw new CustomError("Escribe la dirección de entrega", 400);
  } else {
    if (!shipping.pickupEnabled) {
      throw new CustomError("El retiro en el showroom no está disponible ahora", 400);
    }
    // El punto de retiro sale de los ajustes, no de lo que mande el navegador.
    delivery.province = "";
    delivery.city = shipping.pickup.city;
    delivery.address = pickupLabel(shipping.pickup);
    delivery.reference = "";
  }

  // ---- Ítems: los precios salen de la BD, nunca del cliente ----
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new CustomError("Tu carrito está vacío", 400);
  }
  if (input.items.length > MAX_ITEMS_PER_ORDER) {
    throw new CustomError("Tu carrito tiene demasiadas piezas", 400);
  }

  const rawItems = input.items as Array<Record<string, unknown>>;
  const productIds = rawItems.map((it) => String(it?.productId ?? ""));
  if (productIds.some((id) => !Types.ObjectId.isValid(id))) {
    throw new CustomError("Una de las piezas del carrito no existe", 400);
  }
  const products = await Product.find({ _id: { $in: productIds }, isPublished: true });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const items: IOrderItem[] = rawItems.map((raw) => {
    const product = byId.get(String(raw.productId));
    if (!product) throw new CustomError("Una de las piezas del carrito ya no está disponible", 400);

    const variant = product.variants.find((v) => v._id.toString() === String(raw.variantId));
    if (!variant) {
      throw new CustomError(`La variante elegida de «${product.name}» ya no existe`, 400);
    }

    const quantity = Number(raw.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < MIN_ITEM_QUANTITY ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw new CustomError(
        `La cantidad debe estar entre ${MIN_ITEM_QUANTITY} y ${MAX_ITEM_QUANTITY}`,
        400,
      );
    }
    // Aviso temprano; la garantía real es el descuento atómico más abajo.
    if (variant.stock < quantity) {
      throw new CustomError(
        variant.stock > 0
          ? `Solo queda${variant.stock === 1 ? "" : "n"} ${variant.stock} de «${product.name}»`
          : `«${product.name}» se acaba de agotar`,
        409,
      );
    }

    return {
      product: product._id,
      slug: product.slug,
      name: product.name,
      image: product.images[0]?.url ?? "",
      variantId: variant._id.toString(),
      variantLabel: variant.label,
      unitPriceCents: variant.priceCents,
      quantity,
      lineTotalCents: variant.priceCents * quantity,
    };
  });

  // Método apagado desde el panel: no se acepta. Se leen los ajustes crudos
  // para que la tarjeta sin token llegue al 503 de abajo y no a este 400.
  const { payments } = await getPaymentSettings();
  const paymentSettings = payments[paymentMethod];
  if (!paymentSettings.enabled) {
    throw new CustomError("Ese método de pago no está disponible ahora, elige otro", 400);
  }

  const subtotalCents = items.reduce((sum, it) => sum + it.lineTotalCents, 0);
  const { shippingCents, shippingZone } = quoteShipping(
    shipping,
    method,
    delivery.city,
    subtotalCents,
  );
  const paymentAdjustment = adjustmentCents(
    paymentSettings.adjustment,
    subtotalCents + shippingCents,
  );
  const totalCents = subtotalCents + shippingCents + paymentAdjustment;
  if (totalCents <= 0) throw new CustomError("El total del pedido no es válido", 400);

  // Se valida todo antes para que el checkout muestre los errores reales,
  // pero sin pasarela activa no se guarda ninguna orden ni se toca el stock.
  if (paymentMethod === "card" && !isPayphoneConfigured()) {
    throw new CustomError("Los pagos en línea aún no están activos", 503);
  }

  await expireStaleCardOrders().catch((error) => {
    console.error("[order] no se pudieron vencer reservas abandonadas:", error);
  });

  const lines = stockLines({ items });
  await reserveStock(lines);

  let order;
  try {
    const code = await generateOrderCode();
    order = await Order.create({
      code,
      user: userId && Types.ObjectId.isValid(userId) ? userId : null,
      customer,
      delivery,
      items,
      subtotalCents,
      shippingCents,
      shippingZone,
      paymentAdjustmentCents: paymentAdjustment,
      paymentAdjustmentLabel: paymentAdjustment ? paymentSettings.adjustment.label : "",
      totalCents,
      notes: str(input.notes, 1000),
      isGift: input.isGift === true,
      // Por transferencia el equipo revisa el pago antes de prepararlo.
      status: paymentMethod === "card" ? "pending" : "review",
      paymentMethod,
      // El índice único lo exige aunque el pedido no pase por Payphone.
      clientTransactionId: generateClientTransactionId(code),
    });
  } catch (error) {
    // Sin orden no hay quién retenga las piezas.
    await releaseStock(lines);
    throw error;
  }

  if (paymentMethod !== "card") {
    await notifyReceived(order.toObject());
    return { order: toPublicOrder(order), payphone: null };
  }

  const { token, storeId } = getPayphonePublicConfig();
  return {
    order: toPublicOrder(order),
    payphone: {
      token,
      storeId,
      clientTransactionId: order.clientTransactionId,
      amount: totalCents,
      // No se desglosa IVA: todo el monto va como "sin impuesto".
      amountWithoutTax: totalCents,
      currency: PAYMENT_CURRENCY,
      reference: `Pedido ${order.code} - ${BRAND_NAME}`.slice(0, 100),
      email: customer.email,
      phoneNumber: toInternationalPhone(customer.phone),
      documentId: customer.documentId,
    },
  };
}

async function notifyPaid(order: IOrder) {
  const toCustomer = orderConfirmedEmail(order);
  const toTeam = orderTeamNotificationEmail(order);
  // Se espera el envío: en serverless una promesa suelta puede morir con la respuesta.
  const team = await getOrderRecipients();
  await Promise.allSettled([
    sendEmail(order.customer.email, toCustomer.subject, toCustomer.html),
    ...team.map((to) => sendEmail(to, toTeam.subject, toTeam.html)),
  ]);
}

/**
 * Pedido por transferencia: el cliente sabe que llegó (y a qué cuenta
 * transferir) y el equipo, que tiene que aprobarlo.
 */
async function notifyReceived(order: IOrder) {
  const { bankAccounts } = await getPaymentSettings();
  const toCustomer = orderReceivedEmail(
    order,
    bankAccounts.filter((a) => a.isActive),
  );
  const toTeam = orderTeamNotificationEmail(order);
  const team = await getOrderRecipients();
  await Promise.allSettled([
    sendEmail(order.customer.email, toCustomer.subject, toCustomer.html),
    ...team.map((to) => sendEmail(to, toTeam.subject, toTeam.html)),
  ]);
}

function payphoneFields(data: PayphoneConfirmation) {
  return {
    "payphone.transactionId": typeof data.transactionId === "number" ? data.transactionId : null,
    "payphone.statusCode": typeof data.statusCode === "number" ? data.statusCode : null,
    "payphone.authorizationCode": String(data.authorizationCode ?? ""),
    "payphone.cardBrand": String(data.cardBrand ?? ""),
    "payphone.lastDigits": String(data.lastDigits ?? ""),
    "payphone.raw": data,
  };
}

/**
 * Confirma el pago. Idempotente: la página de respuesta se recarga mucho, así
 * que una orden ya resuelta se devuelve tal cual sin volver a llamar a
 * Payphone ni reenviar correos.
 */
export async function confirmOrder(idRaw: unknown, clientTransactionIdRaw: unknown) {
  const id = Number(idRaw);
  const clientTransactionId = str(clientTransactionIdRaw, 50);
  if (!Number.isInteger(id) || id <= 0 || !clientTransactionId) {
    throw new CustomError("Faltan los datos de la transacción", 400);
  }

  const order = await Order.findOne({ clientTransactionId });
  if (!order) throw new CustomError("Pedido no encontrado", 404);

  // Reserva vencida por abandono (nunca se habló con Payphone): si al final
  // sí se cobró, hay que poder registrarlo.
  const expiredReservation =
    order.status === "failed" && order.stockReleased && order.payphone?.statusCode == null;
  if (order.status !== "pending" && !expiredReservation) {
    return resolvedResponse(order);
  }
  const fromStatus = order.status;

  const data = await confirmTransaction(id, clientTransactionId);
  const fields = payphoneFields(data);

  if (data.statusCode === PAYPHONE_APPROVED) {
    // Si el monto cobrado no coincide con el guardado no se entrega nada.
    const amountMatches = Number(data.amount) === order.totalCents;
    const txMatches = !data.clientTransactionId || data.clientTransactionId === clientTransactionId;
    if (!amountMatches || !txMatches) {
      console.error(
        `[order] ${order.code}: Payphone aprobó ${data.amount} pero la orden es ${order.totalCents}`,
      );
      const failed = await Order.findOneAndUpdate(
        { _id: order._id, status: fromStatus },
        { $set: { ...fields, status: "failed" } },
        { new: true },
      );
      if (failed) await releaseOrderStock(failed._id);
      return {
        order: toPublicOrder(failed ?? order),
        approved: false,
        message: "El monto del pago no coincide con tu pedido. Escríbenos para ayudarte.",
      };
    }

    if (expiredReservation) {
      // Se intenta volver a apartar las piezas; si ya se vendieron, el pago
      // queda registrado y el equipo lo revisa a mano.
      let restocked = true;
      try {
        await reserveStock(stockLines(order));
      } catch {
        restocked = false;
      }
      const paid = await Order.findOneAndUpdate(
        { _id: order._id, status: "failed", "payphone.statusCode": null },
        {
          $set: {
            ...fields,
            status: restocked ? "paid" : "review",
            stockReleased: false,
            paidAt: new Date(),
            ...(restocked
              ? {}
              : {
                  notes: `${order.notes ? `${order.notes}\n` : ""}[Sistema] Pago aprobado después de vencer la reserva y la pieza ya no tenía stock: revisar con la clienta.`,
                }),
          },
        },
        { new: true },
      );
      if (!paid) {
        if (restocked) await releaseStock(stockLines(order));
        const current = await Order.findById(order._id);
        return resolvedResponse(current ?? order);
      }
      await notifyPaid(paid.toObject());
      return {
        order: toPublicOrder(paid),
        approved: true,
        message: "Pago aprobado. Tu pedido está confirmado.",
      };
    }

    // Filtro por status "pending": si dos confirmaciones llegan juntas, solo
    // una gana la transición y solo esa envía los correos.
    const paid = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending" },
      { $set: { ...fields, status: "paid", paidAt: new Date() } },
      { new: true },
    );
    if (!paid) {
      const current = await Order.findById(order._id);
      return resolvedResponse(current ?? order);
    }
    await notifyPaid(paid.toObject());
    return {
      order: toPublicOrder(paid),
      approved: true,
      message: "Pago aprobado. Tu pedido está confirmado.",
    };
  }

  if (expiredReservation) {
    // Ya estaba fallida y sin stock: solo se guarda la respuesta de Payphone.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id },
      { $set: fields },
      { new: true },
    );
    return resolvedResponse(updated ?? order);
  }

  // Cancelado o rechazado → failed y el stock vuelve.
  if (data.statusCode === PAYPHONE_CANCELED) {
    const failed = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending" },
      { $set: { ...fields, status: "failed" } },
      { new: true },
    );
    if (failed) await releaseOrderStock(failed._id);
    return {
      order: toPublicOrder(failed ?? order),
      approved: false,
      message: "El pago fue cancelado o rechazado. Puedes intentarlo de nuevo.",
    };
  }

  // Otro estado (p. ej. aún procesando): se guarda y la orden sigue pendiente.
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: "pending" },
    { $set: fields },
    { new: true },
  );
  return {
    order: toPublicOrder(updated ?? order),
    approved: false,
    message: "Tu pago aún no se confirma. Si ya se debitó, escríbenos con tu código de pedido.",
  };
}

function resolvedResponse(order: any) {
  const approved = PAID_STATUSES.includes(order.status);
  return {
    order: toPublicOrder(order),
    approved,
    message: approved
      ? "¡Pago aprobado! Tu pedido está confirmado."
      : order.status === "pending"
        ? "Tu pago aún no se confirma."
        : "Este pago no se completó. Puedes intentarlo de nuevo.",
  };
}

export async function getMine(userId: string) {
  if (!Types.ObjectId.isValid(userId)) return [];
  const orders = await Order.find({ user: userId }).sort({ createdAt: -1 }).lean();
  return orders.map(toPublicOrder);
}

export async function getByCode(code: string, email: unknown) {
  const normalizedEmail = str(email, 160).toLowerCase();
  if (!normalizedEmail) throw new CustomError("Escribe el correo con el que compraste", 400);
  const raw = code.trim();
  if (!raw) throw new CustomError("Escribe el código de tu pedido", 400);
  // El cliente puede tener a mano el código del pedido (MC-XXXXXX) o el de su
  // comprobante de Payphone (autorización o número de transacción).
  const candidates: Record<string, unknown>[] = [
    { code: raw.toUpperCase() },
    { "payphone.authorizationCode": raw },
  ];
  if (/^\d+$/.test(raw)) candidates.push({ "payphone.transactionId": Number(raw) });
  const order = await Order.findOne({ "customer.email": normalizedEmail, $or: candidates })
    .sort({ createdAt: -1 })
    .lean();
  // Mismo 404 si el código no existe o el correo no coincide: no se filtra qué pedidos existen.
  if (!order || order.customer.email !== normalizedEmail) {
    throw new CustomError("No encontramos un pedido con ese código y correo", 404);
  }
  return toPublicOrder(order);
}

// ---------------- Admin ----------------

export async function listAdmin(query: {
  status?: unknown;
  search?: unknown;
  page?: unknown;
  limit?: unknown;
}) {
  await expireStaleCardOrders().catch((error) => {
    console.error("[order] no se pudieron vencer reservas abandonadas:", error);
  });
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const filter: FilterQuery<IOrder> = {};

  const status = typeof query.status === "string" ? query.status : "";
  if (status) {
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
      throw new CustomError("Estado inválido", 400);
    }
    filter.status = status;
  }

  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ code: rx }, { "customer.email": rx }, { "customer.name": rx }];
  }

  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function getByIdAdmin(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new CustomError("Pedido no encontrado", 404);
  const order = await Order.findById(id).lean();
  if (!order) throw new CustomError("Pedido no encontrado", 404);
  return order;
}

export async function updateStatus(id: string, statusRaw: unknown) {
  const status = String(statusRaw ?? "") as OrderStatus;
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new CustomError("Estado inválido", 400);
  }
  if (!Types.ObjectId.isValid(id)) throw new CustomError("Pedido no encontrado", 404);
  const order = await Order.findById(id);
  if (!order) throw new CustomError("Pedido no encontrado", 404);

  const changed = order.status !== status;
  const releases = RELEASE_STOCK_STATUSES.includes(status);

  // Reactivar un pedido cancelado: las piezas se vuelven a apartar (409 si ya se vendieron).
  if (!releases && order.stockReleased) {
    await reserveStock(stockLines(order));
    order.stockReleased = false;
  }

  order.status = status;
  // Con tarjeta o transferencia, aprobar (preparing) ya significa que el pago entró.
  if (PAID_STATUSES.includes(status) && !order.paidAt) order.paidAt = new Date();
  await order.save();

  if (releases) await releaseOrderStock(order._id);

  if (changed) {
    const mail = orderStatusEmail(order.toObject());
    if (mail) await sendEmail(order.customer.email, mail.subject, mail.html);
  }
  return Order.findById(order._id).lean();
}
