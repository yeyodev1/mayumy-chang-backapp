import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthRequest, JwtPayload } from "../types/AuthRequest";

/**
 * Como authMiddleware pero sin cortar: si el Bearer es válido deja req.user,
 * si falta o venció sigue como invitado. El checkout no debe fallar porque
 * la sesión del navegador expiró a mitad de compra.
 */
export function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(authHeader.split(" ")[1], env.JWT_SECRET) as JwtPayload;
    } catch {
      req.user = undefined;
    }
  }
  next();
}
