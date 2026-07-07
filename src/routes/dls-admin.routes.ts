import { Router } from "express";
import {
  createDlsSession,
  getBook,
  getDlsSession,
  getLoanCount,
  getLoanHistory,
  getUser,
  searchUsers
} from "../controllers/dls-admin.controller";
import { asyncHandler } from "../lib/api";
import { requireAdminKey } from "../middleware/admin";

export const dlsAdminRouter = Router();

dlsAdminRouter.use(requireAdminKey);
dlsAdminRouter.post("/session", asyncHandler(createDlsSession));
dlsAdminRouter.get("/session", asyncHandler(getDlsSession));
dlsAdminRouter.get("/users", asyncHandler(searchUsers));
dlsAdminRouter.get("/users/:userId", asyncHandler(getUser));
dlsAdminRouter.get("/users/:userId/loans/count", asyncHandler(getLoanCount));
dlsAdminRouter.get("/users/:userId/loans", asyncHandler(getLoanHistory));
dlsAdminRouter.get("/books/:bookId", asyncHandler(getBook));
