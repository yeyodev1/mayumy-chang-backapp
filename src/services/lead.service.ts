import { FilterQuery, Types } from "mongoose";
import { env } from "../config/env";
import { LEAD_KINDS, LEAD_STATUSES, LeadKind, LeadStatus } from "../config/store";
import { CustomError } from "../errors/customError.error";
import { ILead, Lead } from "../models/lead.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { getOrderRecipients } from "./adminUser.service";
import { isEmailConfigured, sendEmail } from "./email.service";
import { leadAckEmail, leadTeamEmail } from "./mailTemplates";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function createLead(body: Record<string, unknown>) {
  const kind = str(body.kind, 20) as LeadKind;
  if (!(LEAD_KINDS as readonly string[]).includes(kind)) {
    throw new CustomError("Tipo de solicitud inválido", 400);
  }
  const name = str(body.name, 120);
  if (name.length < 2) throw new CustomError("Escribe tu nombre", 400);
  const email = str(body.email, 160).toLowerCase();
  if (!EMAIL.test(email)) throw new CustomError("Escribe un correo válido", 400);

  const lead = await Lead.create({
    kind,
    name,
    email,
    phone: str(body.phone, 30),
    message: str(body.message, 2000),
    // El presupuesto solo tiene sentido en un diseño a medida.
    budget: kind === "bespoke" ? str(body.budget, 80) : "",
  });

  if (isEmailConfigured()) {
    const plain = lead.toObject();
    const toTeam = leadTeamEmail(plain);
    const toPerson = leadAckEmail(plain);
    // Si no hay correo del equipo configurado, avisa a los admins con aviso encendido.
    const team = env.ORDERS_NOTIFY_EMAIL ? [env.ORDERS_NOTIFY_EMAIL] : await getOrderRecipients();
    // Se espera el envío: en serverless una promesa suelta puede morir con la respuesta.
    await Promise.allSettled([
      sendEmail(email, toPerson.subject, toPerson.html),
      ...team.map((to) => sendEmail(to, toTeam.subject, toTeam.html)),
    ]);
  }

  return { ok: true as const };
}

export async function listLeads(query: {
  kind?: unknown;
  status?: unknown;
  search?: unknown;
  page?: unknown;
  limit?: unknown;
}) {
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const filter: FilterQuery<ILead> = {};

  const kind = str(query.kind, 20);
  if (kind) {
    if (!(LEAD_KINDS as readonly string[]).includes(kind)) {
      throw new CustomError("Tipo de solicitud inválido", 400);
    }
    filter.kind = kind;
  }
  const status = str(query.status, 20);
  if (status) {
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
      throw new CustomError("Estado inválido", 400);
    }
    filter.status = status;
  }
  const search = str(query.search, 120);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { message: rx }];
  }

  const [items, total] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Lead.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function updateLeadStatus(id: string, statusRaw: unknown) {
  if (!Types.ObjectId.isValid(id)) throw new CustomError("Solicitud no encontrada", 404);
  const status = str(statusRaw, 20) as LeadStatus;
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    throw new CustomError("Estado inválido (new, contacted o closed)", 400);
  }
  const lead = await Lead.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
  if (!lead) throw new CustomError("Solicitud no encontrada", 404);
  return lead;
}

export function countSince(date: Date) {
  return Lead.countDocuments({ createdAt: { $gte: date } });
}
