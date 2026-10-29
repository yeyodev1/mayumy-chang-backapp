import { env } from "../config/env";
import { layout, MAIL_COLORS } from "./email.service";

/**
 * Plantillas de correo. Cada función devuelve { subject, html } y no envía
 * nada: el service decide a quién y cuándo. Tono sobrio, sin emojis.
 */

export interface MailContent {
  subject: string;
  html: string;
}

const { INK, MUTED, LINE, CREAM } = MAIL_COLORS;

/** Todo lo que escribe el cliente pasa por acá antes de entrar al HTML. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function firstName(name: string): string {
  return esc((name || "").trim().split(/\s+/)[0] || "");
}

function button(href: string, label: string): string {
  return `<p style="margin:28px 0"><a href="${esc(href)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:14px 26px">${esc(label)}</a></p>`;
}

function codeBadge(code: string): string {
  return `<p style="margin:0 0 24px"><span style="display:inline-block;border:1px solid ${INK};color:${INK};font-family:'Courier New',monospace;font-size:16px;letter-spacing:3px;padding:10px 18px">${esc(code)}</span></p>`;
}

function label(text: string): string {
  return `<span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${esc(text)}</span>`;
}

/** Datos del cobro de Payphone, para que el cliente los cruce con su banco. */
function paymentReceipt(order: MailOrder): string {
  const p = order.payphone;
  if (!p || (!p.authorizationCode && !p.transactionId)) return "";
  const card = p.cardBrand
    ? `${esc(p.cardBrand)}${p.lastDigits ? ` terminada en ${esc(p.lastDigits)}` : ""}`
    : "";
  return `<p style="margin:0 0 16px;font-size:14px">
      ${label("Pago")}<br />
      ${formatMoney(order.totalCents)}${card ? ` con ${card}` : ""}<br />
      ${p.authorizationCode ? `Autorización: ${esc(p.authorizationCode)}<br />` : ""}
      ${p.transactionId ? `Transacción Payphone: ${esc(p.transactionId)}` : ""}
    </p>`;
}

function isTransfer(order: MailOrder): boolean {
  return order.paymentMethod === "transfer";
}

export interface MailBankAccount {
  bank: string;
  logoUrl: string;
  accountType: string;
  holder: string;
  number: string;
  documentId: string;
  email: string;
}

/** Los logos por defecto viven en el frontapp con ruta relativa; el correo necesita la URL completa. */
function absoluteUrl(url: string): string {
  return url.startsWith("/") ? `${env.FRONTEND_URL}${url}` : url;
}

function bankAccountCard(account: MailBankAccount): string {
  const logo = account.logoUrl
    ? `<img src="${esc(absoluteUrl(account.logoUrl))}" alt="${esc(account.bank)}" height="24" style="display:block;height:24px;width:auto;margin:0 0 10px" />`
    : "";
  return `<div style="margin:0 0 10px;padding:16px 18px;background:#ffffff;border:1px solid ${LINE};font-size:14px;line-height:1.6">
      ${logo}
      <strong>${esc(account.bank)}</strong> · Cuenta ${esc(account.accountType)}<br />
      No. de cuenta: <span style="font-family:'Courier New',monospace;font-size:15px;letter-spacing:1px">${esc(account.number)}</span><br />
      Titular: ${esc(account.holder)}<br />
      ${account.documentId ? `${account.documentId.length === 13 ? "RUC" : "Cédula"}: ${esc(account.documentId)}<br />` : ""}
      ${account.email ? `Correo: ${esc(account.email)}` : ""}
    </div>`;
}

function transferBlock(order: MailOrder, accounts: MailBankAccount[]): string {
  if (!accounts.length) {
    return `<p style="margin:0 0 16px;padding:16px 18px;background:${CREAM};font-size:14px">Te escribiremos con los datos para la transferencia de <strong>${formatMoney(order.totalCents)}</strong>.</p>`;
  }
  const emails = [...new Set(accounts.map((a) => a.email).filter(Boolean))];
  const sendTo = emails.length
    ? `a <strong>${emails.map(esc).join("</strong> o <strong>")}</strong> (o responde este correo)`
    : "respondiendo este correo";
  return `<div style="margin:0 0 20px;padding:18px;background:${CREAM};font-size:14px">
      <p style="margin:0 0 12px">Para confirmar tu pedido, transfiere <strong>${formatMoney(order.totalCents)}</strong> a ${accounts.length > 1 ? "una de estas cuentas" : "esta cuenta"}:</p>
      ${accounts.map(bankAccountCard).join("")}
      <p style="margin:8px 0 0">Luego envía el comprobante ${sendTo} indicando tu código <strong>${esc(order.code)}</strong>.</p>
    </div>`;
}

export interface MailOrder {
  _id?: unknown;
  code: string;
  customer: { name: string; email: string; phone: string; documentId: string };
  delivery: {
    method: string;
    province: string;
    city: string;
    address: string;
    reference: string;
    giftNote: string;
  };
  items: Array<{
    name: string;
    variantLabel: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  shippingCents: number;
  paymentAdjustmentCents?: number;
  paymentAdjustmentLabel?: string;
  totalCents: number;
  notes: string;
  isGift?: boolean;
  status: string;
  paymentMethod?: string;
  payphone?: {
    transactionId?: number | null;
    authorizationCode?: string;
    cardBrand?: string;
    lastDigits?: string;
  };
}

function itemsTable(order: MailOrder): string {
  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};vertical-align:top">
          ${esc(item.name)}<br />
          <span style="color:${MUTED};font-size:13px">${item.variantLabel && item.variantLabel !== "Única" ? `${esc(item.variantLabel)} · ` : ""}${item.quantity} × ${formatMoney(item.unitPriceCents)}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};text-align:right;vertical-align:top;white-space:nowrap">${formatMoney(item.lineTotalCents)}</td>
      </tr>`,
    )
    .join("");

  const shipping = order.shippingCents === 0 ? "Sin costo" : formatMoney(order.shippingCents);
  const adjustment = order.paymentAdjustmentCents ?? 0;
  const adjustmentRow = adjustment
    ? `<tr><td style="padding:2px 0">${esc(order.paymentAdjustmentLabel || (adjustment > 0 ? "Recargo" : "Descuento"))}</td><td style="padding:2px 0;text-align:right">${adjustment > 0 ? "+" : "−"}${formatMoney(Math.abs(adjustment))}</td></tr>`
    : "";

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${INK};margin:8px 0 20px">
    ${rows}
    <tr><td style="padding:12px 0 2px">Subtotal</td><td style="padding:12px 0 2px;text-align:right">${formatMoney(order.subtotalCents)}</td></tr>
    <tr><td style="padding:2px 0">Envío</td><td style="padding:2px 0;text-align:right">${shipping}</td></tr>
    ${adjustmentRow}
    <tr><td style="padding:10px 0;font-size:16px;border-top:1px solid ${INK}">Total</td><td style="padding:10px 0;text-align:right;font-size:16px;border-top:1px solid ${INK}">${formatMoney(order.totalCents)}</td></tr>
  </table>`;
}

function giftBlock(order: MailOrder): string {
  if (!order.isGift && !order.delivery.giftNote) return "";
  return `<p style="margin:0 0 16px;font-size:14px">${label("Para regalo")}<br />${
    order.isGift ? "Con empaque de regalo." : ""
  }${order.delivery.giftNote ? `<br /><em>«${esc(order.delivery.giftNote)}»</em>` : ""}</p>`;
}

function deliveryBlock(order: MailOrder): string {
  const { delivery } = order;
  if (delivery.method === "pickup") {
    return `<p style="margin:0 0 16px;font-size:14px">${label("Retiro")}<br />${esc(delivery.address || "Showroom")}${delivery.city ? `, ${esc(delivery.city)}` : ""}</p>`;
  }
  const place = [delivery.city, delivery.province].filter(Boolean).map(esc).join(", ");
  return `<p style="margin:0 0 16px;font-size:14px">${label("Envío por Servientrega")}<br />${esc(delivery.address)}${place ? `, ${place}` : ""}${
    delivery.reference
      ? `<br /><span style="color:${MUTED}">Referencia: ${esc(delivery.reference)}</span>`
      : ""
  }</p>`;
}

function trackingUrl(order: MailOrder): string {
  return `${env.FRONTEND_URL}/pedido/${encodeURIComponent(order.code)}?email=${encodeURIComponent(order.customer.email)}`;
}

/** Al cliente, cuando Payphone aprueba el pago. */
export function orderConfirmedEmail(order: MailOrder): MailContent {
  const body = `
    <p>${firstName(order.customer.name)}, gracias. Recibimos tu pago y tu pedido está confirmado.</p>
    <p style="margin:0 0 6px">${label("Código de pedido")}</p>
    ${codeBadge(order.code)}
    ${itemsTable(order)}
    ${deliveryBlock(order)}
    ${giftBlock(order)}
    ${order.notes ? `<p style="margin:0 0 16px;font-size:14px">${label("Tus notas")}<br />${esc(order.notes)}</p>` : ""}
    ${paymentReceipt(order)}
    <p>Preparamos cada pieza a mano antes del envío. Te escribiremos cuando salga.</p>
    ${button(trackingUrl(order), "Ver mi pedido")}`;
  return {
    subject: `Pedido ${order.code} confirmado`,
    html: layout("Tu pedido está confirmado", body),
  };
}

/** Al cliente, apenas hace un pedido por transferencia: falta que el equipo vea el pago. */
export function orderReceivedEmail(
  order: MailOrder,
  accounts: MailBankAccount[] = [],
): MailContent {
  const body = `
    <p>${firstName(order.customer.name)}, recibimos tu pedido. Lo confirmamos apenas veamos tu transferencia.</p>
    <p style="margin:0 0 6px">${label("Código de pedido")}</p>
    ${codeBadge(order.code)}
    ${isTransfer(order) ? transferBlock(order, accounts) : ""}
    ${itemsTable(order)}
    ${deliveryBlock(order)}
    ${giftBlock(order)}
    ${order.notes ? `<p style="margin:0 0 16px;font-size:14px">${label("Tus notas")}<br />${esc(order.notes)}</p>` : ""}
    <p>Las piezas quedan apartadas para ti mientras confirmamos el pago.</p>
    ${button(trackingUrl(order), "Ver mi pedido")}`;
  return {
    subject: `Recibimos tu pedido ${order.code}`,
    html: layout("Recibimos tu pedido", body),
  };
}

/** Al equipo, para preparar el envío (o aprobar el pedido si es por transferencia). */
export function orderTeamNotificationEmail(order: MailOrder): MailContent {
  const { customer } = order;
  const transfer = isTransfer(order);
  const body = `
    <p>${
      transfer
        ? `Nuevo pedido por <strong>transferencia</strong>. Cuando veas ${formatMoney(order.totalCents)} en la cuenta, apruébalo en el panel.`
        : "Nuevo pedido pagado con tarjeta. Estos son los datos para prepararlo."
    }</p>
    ${codeBadge(order.code)}
    <p style="margin:0 0 16px;font-size:14px">
      ${label("Cliente")}<br />
      ${esc(customer.name)}<br />
      ${esc(customer.email)} · ${esc(customer.phone)}<br />
      Cédula/RUC: ${esc(customer.documentId)}
    </p>
    ${deliveryBlock(order)}
    ${giftBlock(order)}
    ${itemsTable(order)}
    ${order.notes ? `<p style="margin:0 0 16px;font-size:14px">${label("Notas del cliente")}<br />${esc(order.notes)}</p>` : ""}
    ${button(`${env.FRONTEND_URL}/admin/pedidos${order._id ? `/${order._id}` : ""}`, transfer ? "Aprobar en el panel" : "Abrir en el panel")}`;
  return {
    subject: transfer
      ? `Pedido por aprobar ${order.code} · ${formatMoney(order.totalCents)} por transferencia`
      : `Pedido pagado ${order.code} · ${formatMoney(order.totalCents)}`,
    html: layout(transfer ? "Pedido por aprobar" : "Pedido pagado", body),
  };
}

/** Al cliente, cuando el equipo aprueba la transferencia, despacha, entrega o cancela. */
export function orderStatusEmail(order: MailOrder): MailContent | null {
  if (order.status === "preparing" && isTransfer(order)) {
    const body = `
      <p>${firstName(order.customer.name)}, recibimos tu transferencia. Tu pedido está confirmado y lo estamos preparando.</p>
      ${codeBadge(order.code)}
      ${itemsTable(order)}
      ${deliveryBlock(order)}
      <p>Te escribiremos cuando salga.</p>
      ${button(trackingUrl(order), "Ver mi pedido")}`;
    return {
      subject: `Pedido ${order.code} confirmado`,
      html: layout("Tu pedido está confirmado", body),
    };
  }

  if (order.status === "shipped") {
    const isPickup = order.delivery.method === "pickup";
    const body = `
      <p>${firstName(order.customer.name)}, ${
        isPickup
          ? "tu pedido está listo para retirar en el showroom. Escríbenos para coordinar tu cita."
          : "tu pedido salió por Servientrega. Ten tu teléfono a mano por si necesitan ubicarte."
      }</p>
      ${codeBadge(order.code)}
      ${deliveryBlock(order)}
      ${button(trackingUrl(order), "Ver mi pedido")}`;
    return {
      subject: isPickup
        ? `Tu pedido ${order.code} está listo para retirar`
        : `Tu pedido ${order.code} va en camino`,
      html: layout(isPickup ? "Listo para retirar" : "Tu pedido va en camino", body),
    };
  }

  if (order.status === "delivered") {
    const body = `
      <p>${firstName(order.customer.name)}, tu pedido <strong>${esc(order.code)}</strong> fue entregado.</p>
      <p>Para que conserve su brillo, guárdala por separado, lejos de perfumes y humedad, y límpiala con un paño suave. Si tienes cualquier duda, responde este correo.</p>
      ${button(`${env.FRONTEND_URL}/`, "Volver a la tienda")}`;
    return {
      subject: `Pedido ${order.code} entregado`,
      html: layout("Pedido entregado", body),
    };
  }

  if (order.status === "canceled") {
    const body = `
      <p>${firstName(order.customer.name)}, tu pedido <strong>${esc(order.code)}</strong> fue cancelado.</p>
      <p>Si no esperabas este mensaje o ya realizaste el pago, responde este correo y lo resolvemos contigo.</p>`;
    return {
      subject: `Pedido ${order.code} cancelado`,
      html: layout("Pedido cancelado", body),
    };
  }

  return null;
}

/** Bienvenida tras registrarse. */
export function welcomeEmail(name: string): MailContent {
  const body = `
    <p>${firstName(name) || "Hola"}, te damos la bienvenida.</p>
    <p>Desde tu cuenta puedes comprar más rápido y seguir el estado de tus pedidos.</p>
    ${button(`${env.FRONTEND_URL}/`, "Ver la colección")}`;
  return {
    subject: "Bienvenida a Luminous Jewelers",
    html: layout("Bienvenida", body),
  };
}

export interface MailLead {
  kind: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  budget: string;
}

function leadKindLabel(kind: string): string {
  return kind === "bespoke" ? "Diseño a medida" : "Lista de espera Galápagos";
}

/** Al equipo, por cada solicitud de diseño a medida o registro en la lista de espera. */
export function leadTeamEmail(lead: MailLead): MailContent {
  const body = `
    <p>Nueva solicitud: <strong>${esc(leadKindLabel(lead.kind))}</strong>.</p>
    <p style="margin:0 0 16px;font-size:14px">
      ${label("Contacto")}<br />
      ${esc(lead.name)}<br />
      ${esc(lead.email)}${lead.phone ? ` · ${esc(lead.phone)}` : ""}
    </p>
    ${lead.budget ? `<p style="margin:0 0 16px;font-size:14px">${label("Presupuesto")}<br />${esc(lead.budget)}</p>` : ""}
    ${lead.message ? `<p style="margin:0 0 16px;font-size:14px">${label("Mensaje")}<br />${esc(lead.message)}</p>` : ""}
    ${button(`${env.FRONTEND_URL}/admin/leads`, "Abrir en el panel")}`;
  return {
    subject: `${leadKindLabel(lead.kind)} · ${lead.name}`,
    html: layout(leadKindLabel(lead.kind), body),
  };
}

/** Acuse a la persona que dejó sus datos. */
export function leadAckEmail(lead: MailLead): MailContent {
  if (lead.kind === "bespoke") {
    const body = `
      <p>${firstName(lead.name)}, gracias por escribirnos.</p>
      <p>Recibimos tu solicitud de diseño a medida. Te contactaremos en breve para conversar sobre la pieza y coordinar una cita.</p>`;
    return {
      subject: "Recibimos tu solicitud de diseño a medida",
      html: layout("Diseño a medida", body),
    };
  }
  const body = `
    <p>${firstName(lead.name)}, gracias por tu interés.</p>
    <p>Quedaste en la lista de espera de la colección Galápagos. Serás de las primeras personas en conocer las piezas antes del lanzamiento.</p>`;
  return {
    subject: "Estás en la lista de espera de Galápagos",
    html: layout("Lista de espera", body),
  };
}
