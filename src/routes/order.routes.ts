import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { optionalAuthMiddleware } from "../middlewares/optionalAuth.middleware";
import * as orderController from "../controllers/order.controller";

const router = Router();

router.post("/", optionalAuthMiddleware, orderController.create);
router.post("/confirm", orderController.confirm);
router.get("/mine", authMiddleware, orderController.mine);
router.get("/by-code/:code", orderController.byCode);

export default router;
