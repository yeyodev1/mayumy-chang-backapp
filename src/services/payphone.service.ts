import axios from "axios";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";

const CONFIRM_URL = "https://paymentbox.payphonetodoesposible.com/api/confirm";

export const PAYPHONE_APPROVED = 3;
export const PAYPHONE_CANCELED = 2;

/** Respuesta de /api/confirm. Solo tipamos lo que usamos; el resto queda en raw. */
export interface PayphoneConfirmation {
  statusCode: number;
  transactionStatus?: string;
  transactionId?: number;
  clientTransactionId?: string;
  amount?: number;
  authorizationCode?: string;
  cardBrand?: string;
  lastDigits?: string;
  message?: string;
  [key: string]: unknown;
}

export function isPayphoneConfigured(): boolean {
  return Boolean(env.PAYPHONE_TOKEN);
}

export function getPayphonePublicConfig() {
  return { token: env.PAYPHONE_TOKEN, storeId: env.PAYPHONE_STORE_ID };
}

/**
 * Confirma la transacción contra Payphone. Hay que llamarlo antes de 5 min
 * desde el pago o Payphone reversa el cobro solo.
 */
export async function confirmTransaction(
  id: number,
  clientTransactionId: string,
): Promise<PayphoneConfirmation> {
  if (!isPayphoneConfigured()) {
    throw new CustomError("Los pagos en línea aún no están activos", 503);
  }
  try {
    const { data } = await axios.post<PayphoneConfirmation>(
      CONFIRM_URL,
      { id, clientTxId: clientTransactionId },
      {
        headers: {
          Authorization: `Bearer ${env.PAYPHONE_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const payload = error.response.data as { message?: string; errorCode?: number } | undefined;
      console.error("[payphone] confirm rechazado:", error.response.status, payload);
      // 4xx de Payphone = transacción inválida o ajena: es un problema del pago, no del server.
      const status = error.response.status >= 500 ? 502 : 400;
      throw new CustomError(
        payload?.message
          ? `Payphone: ${payload.message}`
          : "No pudimos confirmar el pago con Payphone",
        status,
        payload,
      );
    }
    console.error("[payphone] sin respuesta:", error);
    throw new CustomError("No pudimos comunicarnos con Payphone, intenta de nuevo", 502);
  }
}
