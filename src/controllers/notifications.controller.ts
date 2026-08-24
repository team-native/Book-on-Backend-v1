import { Request, Response } from "express";
import { pool } from "../db/pool";
import { notificationQueries } from "../db/queries";
import { sendSuccess, ApiError } from "../lib/api";

const parseOptionalString = (value: unknown, maximum: number) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.length > maximum) {
    throw new ApiError(400, 4001, "FCM 토큰 정보가 올바르지 않습니다.");
  }
  return value;
};

export const registerFcmToken = async (req: Request, res: Response) => {
  const { token, dlsUserKey, platform, deviceId } = req.body ?? {};
  if (typeof token !== "string" || token.trim().length < 10 || token.length > 4096) {
    throw new ApiError(400, 4001, "FCM 토큰을 입력해 주세요.");
  }

  const q = notificationQueries.upsertFcmToken(
    req.userId!,
    token.trim(),
    parseOptionalString(dlsUserKey, 100),
    parseOptionalString(platform, 30),
    parseOptionalString(deviceId, 100)
  );
  await pool.query(q.sql, q.values);

  sendSuccess(res, 200, "FCM 토큰이 등록되었습니다.", {
    registered: true,
  });
};

export const unregisterFcmToken = async (req: Request, res: Response) => {
  const { token } = req.body ?? {};
  if (typeof token !== "string" || token.trim().length < 10 || token.length > 4096) {
    throw new ApiError(400, 4001, "FCM 토큰을 입력해 주세요.");
  }

  const q = notificationQueries.disableFcmToken(req.userId!, token.trim());
  await pool.query(q.sql, q.values);

  sendSuccess(res, 200, "FCM 토큰이 해제되었습니다.", {
    unregistered: true,
  });
};
