import { Router, raw } from "express";
import { listFavoriteBooks } from "../controllers/books.controller";
import { listCurrentLoans, listLoanHistory } from "../controllers/loans.controller";
import { deleteMyProfileImage, getMe, updateNotificationSettings, updateProfileImage } from "../controllers/me.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const meRouter = Router();

meRouter.use(requireAuth);
meRouter.get("/", asyncHandler(getMe));
meRouter.get("/loans/current", asyncHandler(listCurrentLoans));
meRouter.get("/loans/history", asyncHandler(listLoanHistory));
meRouter.get("/favorite-books", asyncHandler(listFavoriteBooks));
meRouter.post(
  "/profile-image",
  raw({ type: ["image/jpeg", "image/png", "image/gif", "image/webp", "application/octet-stream"], limit: "5mb" }),
  asyncHandler(updateProfileImage)
);
meRouter.delete("/profile-image", asyncHandler(deleteMyProfileImage));
meRouter.patch("/notification-settings", asyncHandler(updateNotificationSettings));
