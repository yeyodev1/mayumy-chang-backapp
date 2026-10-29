import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import { User } from "../models/user.model";

/**
 * Solo cuentas de administración. Va siempre después de authMiddleware.
 * Se confirma contra la base y no solo contra el token: si a alguien se le
 * quita el acceso desde el panel, su token (30 días) deja de servir al instante.
 */
export async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.accountType !== "admin") {
    res.status(403).json({ message: "No tienes permiso para ver esto" });
    return;
  }
  try {
    const user = await User.findById(req.user.userId).select("accountType isActive").lean<{
      accountType: string;
      isActive: boolean;
    }>();
    if (!user || user.accountType !== "admin" || !user.isActive) {
      res.status(403).json({ message: "Tu acceso al panel fue retirado" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
