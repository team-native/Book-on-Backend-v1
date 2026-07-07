import { Router } from "express";
import { createLoan, extendLoan } from "../controllers/loans.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const loansRouter = Router();

loansRouter.use(requireAuth);
loansRouter.post("/", asyncHandler(createLoan));
loansRouter.post("/:loanId/extension", asyncHandler(extendLoan));
