import { Request, Response, NextFunction } from "express";

/**
 * Límite simple por IP en memoria, para formularios públicos. En Vercel cada
 * instancia lleva su propia cuenta: frena abusos obvios, no ataques dirigidos.
 */
export function rateLimitMiddleware(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    // Se limpia de vez en cuando para que el Map no crezca sin fin.
    if (hits.size > 5000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }

    const forwarded = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")[0]
      .trim();
    const ip = forwarded || req.ip || req.socket.remoteAddress || "desconocida";
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res
        .status(429)
        .json({ message: "Demasiados intentos. Espera un momento y vuelve a intentar." });
      return;
    }
    next();
  };
}
