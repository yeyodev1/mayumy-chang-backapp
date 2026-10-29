import { Request, Response, NextFunction } from "express";
import * as storeSettingsService from "../services/storeSettings.service";

/** GET /api/store/config — lo que necesita la tienda pública: envío, pagos, citas, contacto. */
export async function publicConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await storeSettingsService.getPublicConfig());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/settings/store — envío, citas, contacto y colaboración. */
export async function get(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await storeSettingsService.getSettings());
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/settings/store — body parcial: { shipping?, booking?, contact?, collab? } */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await storeSettingsService.updateSettings(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/settings/payments */
export async function getPayments(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await storeSettingsService.getPaymentSettings());
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/settings/payments — body: { payments: { card, transfer }, bankAccounts } */
export async function updatePayments(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await storeSettingsService.updatePaymentSettings(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/settings/bank-logo — multipart, campo `image`. Devuelve { url }. */
export async function uploadBankLogo(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await storeSettingsService.uploadBankLogo(req.file));
  } catch (error) {
    next(error);
  }
}
