import { timingSafeEqual } from "node:crypto";
import { RequestHandler } from "express";
import { env } from "../config/env";
import { ApiError } from "../lib/api";

export const requireAdminKey: RequestHandler = (req, _res, next) => {
  if (!env.adminApiKey) {
    next(new ApiError(503, 5031, "관리자 API 키 설정이 필요합니다."));
    return;
  }
  const received = req.header("x-admin-key") ?? "";
  const expectedBuffer = Buffer.from(env.adminApiKey);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    next(new ApiError(403, 4031, "관리자 권한이 필요합니다."));
    return;
  }
  next();
};
