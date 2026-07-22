import { Router } from "express";
import {
  executeLoanReturn,
  extendLoan,
  getBookInfo,
  getCurrentLoan,
  getLoanHistory,
  getReturnDate,
  searchBook,
  searchStudent,
} from "../controllers/dls.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const dlsRouter = Router();

dlsRouter.use(requireAuth);
dlsRouter.get("/returnDate", asyncHandler(getReturnDate));
dlsRouter.get("/searchStudent", asyncHandler(searchStudent));
dlsRouter.get("/currentLoan", asyncHandler(getCurrentLoan));
dlsRouter.get("/bookInfo", asyncHandler(getBookInfo));
dlsRouter.get("/loanHistory", asyncHandler(getLoanHistory));
dlsRouter.get("/execution", asyncHandler(executeLoanReturn));
dlsRouter.get("/searchBook", asyncHandler(searchBook));
dlsRouter.get("/extendLoan", asyncHandler(extendLoan));
