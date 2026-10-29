import { Router } from "express";
import * as storeSettingsController from "../controllers/storeSettings.controller";

const router = Router();

router.get("/config", storeSettingsController.publicConfig);

export default router;
