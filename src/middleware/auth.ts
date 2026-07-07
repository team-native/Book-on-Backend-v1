import { RequestHandler } from "express";
import { ApiError } from "../lib/api";
import { verifyAccessToken } from "../lib/token";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.header("authorization");
  const [type, token] = authorization?.split(" ") ?? [];

  if (type !== "Bearer" || !token) {
    next(new ApiError(401, 4010, "인증이 필요합니다."));
    return;
  }

  try {
    req.userId = verifyAccessToken(token).sub;
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.header("authorization");
  if (!authorization) {
    next();
    return;
  }

  const [type, token] = authorization.split(" ");
  if (type !== "Bearer" || !token) {
    next(new ApiError(401, 4010, "인증이 필요합니다."));
    return;
  }

  try {
    req.userId = verifyAccessToken(token).sub;
    next();
  } catch (error) {
    next(error);
  }
};
