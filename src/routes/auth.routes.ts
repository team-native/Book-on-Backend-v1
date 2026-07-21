import { Router } from "express";
import {
  login,
  loginRead365,
  refresh,
  register,
  resetPassword,
  sendResetEmail
} from "../controllers/auth.controller";
import { asyncHandler } from "../lib/api";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(register));
authRouter.post("/login", asyncHandler(login));
authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/read365/login", requireAuth, asyncHandler(loginRead365));
authRouter.post("/password-reset/email", asyncHandler(sendResetEmail));
authRouter.patch("/password-reset", asyncHandler(resetPassword));
