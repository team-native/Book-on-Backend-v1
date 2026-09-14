import { Router, raw } from "express";
import { listFavoriteBooks } from "../controllers/books.controller";
import { listCurrentLoans, listLoanHistory } from "../controllers/loans.controller";
import { deleteMyProfileImage, getMe, updateNotificationSettings, updateProfileImage } from "../controllers/me.controller";
import {
  getMyUnreadNotificationCount,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  registerFcmToken,
  unregisterFcmToken,
} from "../controllers/notifications.controller";
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
meRouter.post("/fcm-token", asyncHandler(registerFcmToken));
meRouter.delete("/fcm-token", asyncHandler(unregisterFcmToken));
meRouter.get("/notifications", asyncHandler(listMyNotifications));
meRouter.patch("/notifications/read-all", asyncHandler(markAllMyNotificationsRead));
meRouter.get("/notifications/unread-count", asyncHandler(getMyUnreadNotificationCount));
meRouter.patch("/notifications/:notificationId/read", asyncHandler(markMyNotificationRead));
