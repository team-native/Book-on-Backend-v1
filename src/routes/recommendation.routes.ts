import { Router } from "express";
import { recommendForUser } from "../controllers/recommendation.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const recommendationRouter = Router();
recommendationRouter.post("/user", requireAuth, asyncHandler(recommendForUser));
