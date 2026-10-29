import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import * as adminController from "../controllers/admin.controller";
import * as productController from "../controllers/product.controller";
import * as categoryController from "../controllers/category.controller";
import * as orderController from "../controllers/order.controller";
import * as adminUserController from "../controllers/adminUser.controller";
import * as storeSettingsController from "../controllers/storeSettings.controller";
import * as leadController from "../controllers/lead.controller";

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", adminController.stats);

router.get("/products", productController.listAdmin);
router.post("/products", productController.create);
router.get("/products/:id", productController.getById);
router.put("/products/:id", productController.update);
router.delete("/products/:id", productController.remove);
router.patch("/products/:id/stock", productController.updateStock);
router.post("/products/:id/images", uploadMiddleware.single("image"), productController.addImage);
// Va antes que /images/:publicId para que "order" no se tome como un publicId.
router.put("/products/:id/images/order", productController.reorderImages);
router.delete("/products/:id/images/:publicId", productController.removeImage);
// Imágenes sembradas (publicId ""): DELETE /products/:id/images?url=/products/x.webp
router.delete("/products/:id/images", productController.removeImage);

router.get("/categories", categoryController.listAdmin);
router.post("/categories", categoryController.create);
// Va antes que /categories/:id para que "order" no se tome como un id.
router.put("/categories/order", categoryController.reorder);
router.put("/categories/:id", categoryController.update);
router.delete("/categories/:id", categoryController.remove);

router.get("/orders", orderController.listAdmin);
router.get("/orders/:id", orderController.getByIdAdmin);
router.patch("/orders/:id/status", orderController.updateStatus);

router.get("/customers", adminController.customers);
router.get("/leads", leadController.listAdmin);
router.patch("/leads/:id", leadController.updateStatus);

router.get("/users", adminUserController.list);
router.post("/users", adminUserController.create);
// Va antes que /users/:id para que "test-notification" no se tome como un id.
router.post("/users/test-notification", adminUserController.testNotification);
router.patch("/users/:id", adminUserController.update);
router.delete("/users/:id", adminUserController.remove);

router.get("/settings/store", storeSettingsController.get);
router.put("/settings/store", storeSettingsController.update);
router.get("/settings/payments", storeSettingsController.getPayments);
router.put("/settings/payments", storeSettingsController.updatePayments);
router.post(
  "/settings/bank-logo",
  uploadMiddleware.single("image"),
  storeSettingsController.uploadBankLogo,
);

export default router;
