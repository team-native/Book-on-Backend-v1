import { Router } from "express";
import { getHome, getReaderRankings, listNotices } from "../controllers/public.controller";
import { asyncHandler } from "../lib/api";

export const publicRouter = Router();

publicRouter.get("/notices", asyncHandler(listNotices));
publicRouter.get("/rankings/readers", asyncHandler(getReaderRankings));
publicRouter.get("/home", asyncHandler(getHome));
