import { RequestHandler } from "express";
import { pool } from "../db/pool";
import { authQueries } from "../db/queries";
import { RowDataPacket } from "../db/types";
import { ApiError } from "../lib/api";
import { verifyAccessToken } from "../lib/token";

const assertActiveSession = async (userId: number, sessionId: number) => {
  const q = authQueries.findActiveSession(userId, sessionId);
  const [sessions] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  const session = sessions[0];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new ApiError(401, 4010, "?몄쬆???꾩슂?⑸땲??");
  }
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const authorization = req.header("authorization");
  const [type, token] = authorization?.split(" ") ?? [];

  if (type !== "Bearer" || !token) {
    next(new ApiError(401, 4010, "인증이 필요합니다."));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    await assertActiveSession(payload.sub, payload.sid);
    req.userId = payload.sub;
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth: RequestHandler = async (req, _res, next) => {
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
    const payload = verifyAccessToken(token);
    await assertActiveSession(payload.sub, payload.sid);
    req.userId = payload.sub;
    next();
  } catch (error) {
    next(error);
  }
};
