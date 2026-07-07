import { Router } from "express";
import { listFavoriteBooks } from "../controllers/books.controller";
import { listCurrentLoans, listLoanHistory } from "../controllers/loans.controller";
import { getMe, updateNotificationSettings } from "../controllers/me.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const meRouter = Router();

meRouter.use(requireAuth);
meRouter.get("/", asyncHandler(getMe));
meRouter.get("/loans/current", asyncHandler(listCurrentLoans));
meRouter.get("/loans/history", asyncHandler(listLoanHistory));
meRouter.get("/favorite-books", asyncHandler(listFavoriteBooks));
meRouter.patch("/notification-settings", asyncHandler(updateNotificationSettings));
