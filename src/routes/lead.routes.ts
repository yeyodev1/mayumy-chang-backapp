import { Router } from "express";
import { rateLimitMiddleware } from "../middlewares/rateLimit.middleware";
import * as leadController from "../controllers/lead.controller";

const router = Router();

// 5 por minuto por IP: el formulario es público y dispara correos.
router.post("/", rateLimitMiddleware(5, 60 * 1000), leadController.create);

export default router;
