import { Router } from "express";
import * as productController from "../controllers/product.controller";

const router = Router();

router.get("/", productController.list);
// Va antes que /:slug para que "piece-of-month" no se tome como un slug.
router.get("/piece-of-month", productController.pieceOfMonth);
router.get("/:slug/related", productController.related);
router.get("/:slug", productController.getBySlug);

export default router;
