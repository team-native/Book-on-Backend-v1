import { Router } from "express";
import {
  createDlsSession,
  extendLoan,
  getBook,
  getBookInfo,
  getCurrentLoans,
  getDlsSession,
  getLoanCount,
  getLoanHistory,
  getLoanHistoryByUserKey,
  getUser,
  searchBooks,
  searchStudents,
  searchUsers
} from "../controllers/dls-admin.controller";
import { asyncHandler } from "../lib/api";
import { requireAdminKey } from "../middleware/admin";

export const dlsAdminRouter = Router();

dlsAdminRouter.use(requireAdminKey);
dlsAdminRouter.post("/session", asyncHandler(createDlsSession));
dlsAdminRouter.get("/session", asyncHandler(getDlsSession));
dlsAdminRouter.get("/users", asyncHandler(searchUsers));
dlsAdminRouter.get("/users/search/students", asyncHandler(searchStudents));
dlsAdminRouter.get("/users/:userId", asyncHandler(getUser));
dlsAdminRouter.get("/users/:userId/loans/count", asyncHandler(getLoanCount));
dlsAdminRouter.get("/users/:userId/loans", asyncHandler(getLoanHistory));
dlsAdminRouter.get("/students/:userKey/loans/current", asyncHandler(getCurrentLoans));
dlsAdminRouter.get("/students/:userKey/loans/history", asyncHandler(getLoanHistoryByUserKey));
dlsAdminRouter.get("/books/search", asyncHandler(searchBooks));
dlsAdminRouter.get("/books/info", asyncHandler(getBookInfo));
dlsAdminRouter.get("/books/:bookId", asyncHandler(getBook));
dlsAdminRouter.post("/loans/extend", asyncHandler(extendLoan));
