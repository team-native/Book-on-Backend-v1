import { Router } from "express";
import { getHome, getImage, getReaderRankings, listNotices } from "../controllers/public.controller";
import { asyncHandler } from "../lib/api";

export const publicRouter = Router();

publicRouter.get("/notices", asyncHandler(listNotices));
publicRouter.get("/rankings/readers", asyncHandler(getReaderRankings));
publicRouter.get("/image/:file", asyncHandler(getImage));
publicRouter.get("/home", asyncHandler(getHome));
