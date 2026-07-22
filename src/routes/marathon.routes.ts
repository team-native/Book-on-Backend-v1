import { Router } from "express";
import { getMarathon, getRead365MyInfoHandler } from "../controllers/marathon.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const marathonRouter = Router();

marathonRouter.get("/read365/myinfo", requireAuth, asyncHandler(getRead365MyInfoHandler));
marathonRouter.get("/", requireAuth, asyncHandler(getMarathon));
