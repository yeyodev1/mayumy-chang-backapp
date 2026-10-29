import { Request, Response, NextFunction } from "express";
import * as adminService from "../services/admin.service";

/** GET /api/admin/stats */
export async function stats(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await adminService.getStats());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/customers */
export async function customers(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await adminService.listCustomers(req.query));
  } catch (error) {
    next(error);
  }
}
