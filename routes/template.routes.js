import express from "express";

import { cloneTemplate, getTemplate, listTemplates } from "../controllers/template.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", listTemplates);
router.get("/:slug", getTemplate);
router.post("/:slug/clone", cloneTemplate);

export default router;
