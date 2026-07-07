import { Router } from "express";
import {
  login,
  register,
  resetPassword,
  sendResetEmail
} from "../controllers/auth.controller";
import { asyncHandler } from "../lib/api";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(register));
authRouter.post("/login", asyncHandler(login));
authRouter.post("/password-reset/email", asyncHandler(sendResetEmail));
authRouter.patch("/password-reset", asyncHandler(resetPassword));
