import { User } from "../models/user.model";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { sendEmail } from "./email.service";
import { orderTeamNotificationEmail, type MailOrder } from "./mailTemplates";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  notifyOrders: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date | null;
}

function toView(user: any): AdminUserView {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    notifyOrders: user.notifyOrders !== false,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt ?? null,
  };
}

export async function listAdmins(): Promise<AdminUserView[]> {
  const users = await User.find({ accountType: "admin" }).sort({ createdAt: 1 }).lean();
  return users.map(toView);
}

export async function createAdmin(input: {
  email?: unknown;
  name?: unknown;
  password?: unknown;
  notifyOrders?: unknown;
}): Promise<AdminUserView> {
  const email = String(input.email ?? "")
    .toLowerCase()
    .trim();
  const name = String(input.name ?? "").trim();
  const password = String(input.password ?? "");
  if (!EMAIL.test(email)) throw new CustomError("Escribe un correo válido", 400);
  if (name.length < 2) throw new CustomError("Escribe el nombre de la persona", 400);
  if (password.length < MIN_PASSWORD) {
    throw new CustomError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`, 400);
  }

  const existing = await User.findOne({ email });
  if (existing?.accountType === "admin") {
    throw new CustomError("Ese correo ya tiene acceso al panel", 409);
  }

  // Si ya compró con ese correo, se le da acceso a la misma cuenta.
  const user = existing ?? new User({ email });
  user.name = name;
  user.password = password;
  user.accountType = "admin";
  user.isActive = true;
  user.notifyOrders = input.notifyOrders !== false;
  await user.save();
  return toView(user);
}

async function findAdmin(id: string) {
  const user = await User.findOne({ _id: id, accountType: "admin" }).catch(() => null);
  if (!user) throw new CustomError("Usuario no encontrado", 404);
  return user;
}

async function activeAdminsCount(): Promise<number> {
  return User.countDocuments({ accountType: "admin", isActive: true });
}

export async function updateAdmin(
  id: string,
  requesterId: string,
  input: { name?: unknown; notifyOrders?: unknown; isActive?: unknown; password?: unknown },
): Promise<AdminUserView> {
  const user = await findAdmin(id);

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (name.length < 2) throw new CustomError("Escribe el nombre de la persona", 400);
    user.name = name;
  }
  if (input.notifyOrders !== undefined) user.notifyOrders = Boolean(input.notifyOrders);
  if (input.isActive !== undefined) {
    const next = Boolean(input.isActive);
    if (!next && id === requesterId)
      throw new CustomError("No puedes desactivar tu propio acceso", 400);
    if (!next && user.isActive && (await activeAdminsCount()) <= 1) {
      throw new CustomError("Debe quedar al menos un administrador activo", 400);
    }
    user.isActive = next;
  }
  if (input.password !== undefined && input.password !== "") {
    const password = String(input.password);
    if (password.length < MIN_PASSWORD) {
      throw new CustomError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`, 400);
    }
    user.password = password;
  }

  await user.save();
  return toView(user);
}

export async function removeAdmin(id: string, requesterId: string): Promise<void> {
  if (id === requesterId) throw new CustomError("No puedes quitarte el acceso a ti mismo", 400);
  const user = await findAdmin(id);
  if (user.isActive && (await activeAdminsCount()) <= 1) {
    throw new CustomError("Debe quedar al menos un administrador activo", 400);
  }
  await user.deleteOne();
}

/** Admins activos con el aviso encendido, más el correo general del equipo. */
export async function getOrderRecipients(): Promise<string[]> {
  const admins = await User.find({
    accountType: "admin",
    isActive: true,
    notifyOrders: { $ne: false },
  })
    .select("email")
    .lean();
  const emails = [env.ORDERS_NOTIFY_EMAIL, ...admins.map((a) => a.email)]
    .map((e) =>
      String(e || "")
        .toLowerCase()
        .trim(),
    )
    .filter(Boolean);
  return [...new Set(emails)];
}

/** Envía un aviso de venta de ejemplo para comprobar que los correos llegan. */
export async function sendTestSaleNotification(): Promise<{ sent: string[]; failed: string[] }> {
  const recipients = await getOrderRecipients();
  const sample: MailOrder = {
    code: "MC-PRUEBA",
    customer: {
      name: "Cliente de prueba",
      email: "cliente@ejemplo.com",
      phone: "+593 99 123 4567",
      documentId: "0900000000",
    },
    delivery: {
      method: "delivery",
      province: "Guayas",
      city: "Guayaquil",
      address: "Av. de las Américas 123",
      reference: "Edificio blanco",
      giftNote: "",
    },
    items: [
      {
        name: "Aretes Heptágono Zafiro",
        variantLabel: "Única",
        quantity: 1,
        unitPriceCents: 4800,
        lineTotalCents: 4800,
      },
    ],
    subtotalCents: 4800,
    shippingCents: 400,
    totalCents: 5200,
    notes: "Este es un correo de PRUEBA: no hay ningún pedido real.",
    status: "paid",
    paymentMethod: "card",
  };
  const mail = orderTeamNotificationEmail(sample);
  const subject = `[PRUEBA] ${mail.subject}`;

  const results = await Promise.all(
    recipients.map(async (to) => ({ to, ok: await sendEmail(to, subject, mail.html) })),
  );
  return {
    sent: results.filter((r) => r.ok).map((r) => r.to),
    failed: results.filter((r) => !r.ok).map((r) => r.to),
  };
}
