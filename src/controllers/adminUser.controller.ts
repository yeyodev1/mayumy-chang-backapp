import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as adminUserService from "../services/adminUser.service";

/** GET /api/admin/users */
export async function list(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await adminUserService.listAdmins());
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/users — body: { name, email, password, notifyOrders? } */
export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await adminUserService.createAdmin(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/users/:id — body: { name?, notifyOrders?, isActive?, password? } */
export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await adminUserService.updateAdmin(
      String(req.params.id),
      String(req.user?.userId),
      req.body ?? {},
    );
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/users/:id */
export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await adminUserService.removeAdmin(String(req.params.id), String(req.user?.userId));
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/users/test-notification — correo de venta de ejemplo a los admins. */
export async function testNotification(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await adminUserService.sendTestSaleNotification());
  } catch (error) {
    next(error);
  }
}
