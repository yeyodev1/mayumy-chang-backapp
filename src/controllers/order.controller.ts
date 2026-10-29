import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import { CustomError } from "../errors/customError.error";
import * as orderService from "../services/order.service";

/** POST /api/orders — auth opcional. */
export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await orderService.createOrder(req.body ?? {}, req.user?.userId ?? null);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/orders/confirm — body: { id, clientTransactionId } */
export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, clientTransactionId } = req.body ?? {};
    res.status(200).json(await orderService.confirmOrder(id, clientTransactionId));
  } catch (error) {
    next(error);
  }
}

/** GET /api/orders/mine */
export async function mine(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new CustomError("No autorizado", 401);
    res.status(200).json(await orderService.getMine(req.user.userId));
  } catch (error) {
    next(error);
  }
}

/** GET /api/orders/by-code/:code?email= */
export async function byCode(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.getByCode(String(req.params.code), req.query.email));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/orders */
export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.listAdmin(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/orders/:id */
export async function getByIdAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.getByIdAdmin(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/orders/:id/status — body: { status } */
export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.updateStatus(String(req.params.id), req.body?.status));
  } catch (error) {
    next(error);
  }
}
