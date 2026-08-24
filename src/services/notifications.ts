import { pool } from "../db/pool";
import { notificationQueries } from "../db/queries";
import { ResultSetHeader, RowDataPacket } from "../db/types";
import { disableFcmToken, isFcmConfigured, sendFcmMessage } from "./fcm";

type DeliveryTarget = {
  userId: number;
  token: string;
};

type DueLoanRow = DeliveryTarget & {
  loanId: string;
  source: string;
  bookTitle: string;
  dueDate: string;
};

type NoticeRow = DeliveryTarget;

const groupByUser = <T extends DeliveryTarget>(rows: T[]) => {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    groups.set(row.userId, [...(groups.get(row.userId) ?? []), row]);
  }
  return groups;
};

const groupDueLoans = (rows: DueLoanRow[]) => {
  const groups = new Map<string, DueLoanRow[]>();
  for (const row of rows) {
    const key = `${row.userId}:${row.source}:${row.loanId}:${row.dueDate}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
};

const markDelivery = async (
  userId: number,
  kind: string,
  referenceType: string,
  referenceId: string,
  targetDate: string | null,
  title: string,
  body: string
) => {
  const q1 = notificationQueries.insertNotificationDelivery(
    userId,
    kind,
    referenceType,
    referenceId,
    targetDate,
    title,
    body
  );
  const [result] = await pool.query<ResultSetHeader>(q1.sql, q1.values);
  if (result.affectedRows === 0) {
    return false;
  }

  const q2 = notificationQueries.markNotificationDeliverySent(userId, kind, referenceType, referenceId, targetDate);
  await pool.query(q2.sql, q2.values);
  return true;
};

const sendToTokens = async (
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>
) => {
  let sentCount = 0;
  for (const token of tokens) {
    const result = await sendFcmMessage({ token, title, body, data });
    if (result.sent) {
      sentCount += 1;
    }
    if (result.invalidToken) {
      await disableFcmToken(token);
    }
  }
  return sentCount;
};

export const sendDueLoanReminders = async (daysBefore: 0 | 3) => {
  if (!isFcmConfigured()) {
    console.warn("FCM is not configured. Due loan reminders were not sent.");
    return { sentUsers: 0 };
  }

  const q = notificationQueries.listDueLoanReminderTargets(daysBefore);
  const [rows] = await pool.query<DueLoanRow[]>(q.sql, q.values);
  const grouped = groupDueLoans(rows);
  const kind = daysBefore === 3 ? "LOAN_DUE_3_DAYS" : "LOAN_DUE_TODAY";
  let sentUsers = 0;

  for (const userRows of grouped.values()) {
    const first = userRows[0];
    const title = daysBefore === 3 ? "반납 3일 전 알림" : "오늘 반납일입니다";
    const body =
      daysBefore === 3
        ? `"${first.bookTitle}" 반납일이 3일 남았습니다.`
        : `"${first.bookTitle}" 오늘까지 반납해 주세요.`;
    const sentCount = await sendToTokens(
      userRows.map((row) => row.token),
      title,
      body,
      {
        type: "loan_due",
        loanId: first.loanId,
        source: first.source,
        dueDate: first.dueDate,
        daysBefore: String(daysBefore),
      }
    );

    if (sentCount > 0) {
      const marked = await markDelivery(
        first.userId,
        kind,
        first.source === "dls" ? "dls_loan" : "loan",
        first.loanId,
        first.dueDate,
        title,
        body
      );
      if (marked) sentUsers += 1;
    }
  }

  return { sentUsers };
};

export const sendNoticeNotification = async (notice: { noticeId: number; title: string; summary: string }) => {
  if (!isFcmConfigured()) {
    console.warn("FCM is not configured. Notice notifications were not sent.");
    return { sentUsers: 0 };
  }

  const q = notificationQueries.listNoticeNotificationTargets(notice.noticeId);
  const [rows] = await pool.query<NoticeRow[]>(q.sql, q.values);
  const grouped = groupByUser(rows);
  const title = `도서부 공지: ${notice.title}`;
  const body = notice.summary;
  let sentUsers = 0;

  for (const userRows of grouped.values()) {
    const first = userRows[0];
    const sentCount = await sendToTokens(
      userRows.map((row) => row.token),
      title,
      body,
      {
        type: "notice",
        noticeId: String(notice.noticeId),
      }
    );

    if (sentCount > 0) {
      const marked = await markDelivery(
        first.userId,
        "NOTICE",
        "notice",
        String(notice.noticeId),
        "",
        title,
        body
      );
      if (marked) sentUsers += 1;
    }
  }

  return { sentUsers };
};

export const sendPendingNoticeNotifications = async (limit = 20) => {
  const q = notificationQueries.listPendingNoticeNotifications(limit);
  const [notices] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  let sentUsers = 0;

  for (const notice of notices) {
    const result = await sendNoticeNotification({
      noticeId: Number(notice.noticeId),
      title: notice.title,
      summary: notice.summary,
    });
    sentUsers += result.sentUsers;
  }

  return { sentUsers, noticeCount: notices.length };
};
