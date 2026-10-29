import express, { Application } from "express";
import authRoutes from "./auth.routes";
import healthRoutes from "./health.routes";
import productRoutes from "./product.routes";
import categoryRoutes from "./category.routes";
import orderRoutes from "./order.routes";
import leadRoutes from "./lead.routes";
import storeRoutes from "./store.routes";
import adminRoutes from "./admin.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);
  router.use("/products", productRoutes);
  router.use("/categories", categoryRoutes);
  router.use("/orders", orderRoutes);
  router.use("/leads", leadRoutes);
  router.use("/store", storeRoutes);
  router.use("/admin", adminRoutes);
}

export default routerApi;
