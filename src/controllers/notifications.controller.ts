import { Request, Response } from "express";
import { pool } from "../db/pool";
import { notificationQueries } from "../db/queries";
import { RowDataPacket } from "../db/types";
import { ApiError, pagination, parseId, parsePositiveInteger, sendSuccess } from "../lib/api";

const formatCreatedAt = (value: unknown) => {
  if (typeof value !== "string") return value;
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
};

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

export const listMyNotifications = async (req: Request, res: Response) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);
  const countQuery = notificationQueries.countNotifications(req.userId!);
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery.sql, countQuery.values);
  const totalCount = Number(countRows[0]?.totalCount ?? 0);
  const query = notificationQueries.listNotifications(req.userId!, size, (page - 1) * size);
  const [rows] = await pool.query<RowDataPacket[]>(query.sql, query.values);

  sendSuccess(res, 200, "success", {
    notifications: rows.map((row) => ({
      id: Number(row.id), type: row.type, title: row.title, body: row.body,
      isRead: Boolean(row.isRead), createdAt: formatCreatedAt(row.createdAt), deepLink: row.deepLink ?? null,
    })),
    pagination: pagination(page, size, totalCount),
  });
};

export const markMyNotificationRead = async (req: Request, res: Response) => {
  const notificationId = parseId(req.params.notificationId, "notificationId");
  const update = notificationQueries.markNotificationRead(req.userId!, notificationId);
  await pool.query(update.sql, update.values);
  const query = notificationQueries.findNotification(req.userId!, notificationId);
  const [rows] = await pool.query<RowDataPacket[]>(query.sql, query.values);
  if (!rows[0]) throw new ApiError(404, 4040, "알림을 찾을 수 없습니다.");
  sendSuccess(res, 200, "success", { id: Number(rows[0].id), isRead: Boolean(rows[0].isRead) });
};

export const markAllMyNotificationsRead = async (req: Request, res: Response) => {
  const query = notificationQueries.markAllNotificationsRead(req.userId!);
  await pool.query(query.sql, query.values);
  sendSuccess(res, 200, "success", { updated: true });
};

export const getMyUnreadNotificationCount = async (req: Request, res: Response) => {
  const query = notificationQueries.countUnreadNotifications(req.userId!);
  const [rows] = await pool.query<RowDataPacket[]>(query.sql, query.values);
  sendSuccess(res, 200, "success", { count: Number(rows[0]?.count ?? 0) });
};
