import { Resend } from "resend";
import { env } from "../config/env";

let resend: Resend | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

/**
 * Envía un correo. Nunca lanza: el fallo de un correo no debe romper el
 * flujo que lo disparó (una compra, un registro). Devuelve si Resend lo aceptó.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY no definida — no se envió "${subject}" a ${to}`);
    return false;
  }

  try {
    const { error } = await client.emails.send({ from: env.RESEND_FROM_EMAIL, to, subject, html });
    if (error) {
      console.error("[email] Resend rechazó el envío:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed:", error);
    return false;
  }
}

export const MAIL_COLORS = {
  INK: "#111111",
  MUTED: "#6b6760",
  LINE: "#e2ddd2",
  CREAM: "#F4F1EA",
};

/**
 * Plantilla base de Mayumy Chang: fondo crema, texto casi negro, serif en
 * títulos y mucho aire. Todo inline porque los clientes de correo ignoran
 * las hojas de estilo.
 */
export function layout(title: string, body: string): string {
  const { INK, MUTED, LINE, CREAM } = MAIL_COLORS;
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:40px 12px;font-family:Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${LINE}">
        <tr><td style="padding:32px 36px 24px;text-align:center;border-bottom:1px solid ${LINE}">
          <span style="font-family:Georgia,'Times New Roman',serif;color:${INK};font-size:22px;letter-spacing:4px;text-transform:uppercase">Mayumy Chang</span><br />
          <span style="color:${MUTED};font-size:10px;letter-spacing:4px;text-transform:uppercase">Alta Joyería</span>
        </td></tr>
        <tr><td style="padding:36px;color:${INK};font-size:15px;line-height:1.7">
          <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;color:${INK}">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:20px 36px;background:${CREAM};color:${MUTED};font-size:11px;line-height:1.6;letter-spacing:1px;text-align:center">
          Mayumy Chang · Alta Joyería<br />
          Guayaquil, Ecuador · © ${new Date().getFullYear()}
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}
