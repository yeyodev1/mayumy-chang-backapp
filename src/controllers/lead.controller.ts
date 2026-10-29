import { Request, Response, NextFunction } from "express";
import * as leadService from "../services/lead.service";

/** POST /api/leads — lista de espera Galápagos o diseño a medida. */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await leadService.createLead(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/leads?kind=&status=&search=&page= */
export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await leadService.listLeads(req.query));
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/leads/:id — body: { status } */
export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res
      .status(200)
      .json(await leadService.updateLeadStatus(String(req.params.id), req.body?.status));
  } catch (error) {
    next(error);
  }
}
