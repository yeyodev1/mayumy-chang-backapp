import { Request, Response, NextFunction } from "express";
import * as categoryService from "../services/category.service";

/** GET /api/categories — solo las visibles, en orden, con counts por segmento. */
export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.listPublic());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/categories — todas, con cuántos productos tiene cada una. */
export async function listAdmin(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.listAdmin());
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/categories — body: { name, blurb?, isVisible? } */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await categoryService.create(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/categories/order — body: { ids } */
export async function reorder(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.reorder(req.body?.ids));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/categories/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.update(String(req.params.id), req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/categories/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.remove(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}
