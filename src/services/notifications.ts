import { pool } from "../db/pool";
import { notificationQueries } from "../db/queries";
import { ResultSetHeader, RowDataPacket } from "../db/types";
import { disableFcmToken, isFcmConfigured, sendFcmMessage } from "./fcm";

type DeliveryTarget = {
  userId: number;
};

type DueLoanRow = DeliveryTarget & {
  loanId: string;
  source: string;
  bookTitle: string;
  dueDate: string;
};

type NoticeRow = DeliveryTarget;
type TokenRow = { token: string };

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

const saveNotification = async (
  userId: number,
  notificationKey: string,
  type: "loan_due" | "notice" | "new_book",
  title: string,
  body: string,
  deepLink: string | null,
  payload: Record<string, string>
) => {
  const insert = notificationQueries.insertNotification(
    userId,
    notificationKey,
    type,
    title,
    body,
    deepLink,
    JSON.stringify(payload)
  );
  await pool.query(insert.sql, insert.values);
  const find = notificationQueries.findNotificationIdByKey(userId, notificationKey);
  const [rows] = await pool.query<RowDataPacket[]>(find.sql, find.values);
  return Number(rows[0]?.id);
};

const getTokens = async (userId: number) => {
  const q = notificationQueries.listActiveFcmTokens(userId);
  const [rows] = await pool.query<TokenRow[]>(q.sql, q.values);
  return rows.map((row) => row.token);
};

const sendToTokens = async (
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>
) => {
  let sentCount = 0;
  for (const token of tokens) {
    try {
      const result = await sendFcmMessage({ token, title, body, data });
      if (result.sent) sentCount += 1;
      if (result.invalidToken) await disableFcmToken(token);
    } catch (error) {
      console.error("Failed to send FCM notification.", error);
    }
  }
  return sentCount;
};

export const sendDueLoanReminders = async (daysBefore: 0 | 3) => {
  if (!isFcmConfigured()) console.warn("FCM is not configured. Notifications will be stored without push delivery.");

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
    const payload = {
      type: "loan_due",
      loanId: first.loanId,
      source: first.source,
      dueDate: first.dueDate,
      daysBefore: String(daysBefore),
    };
    await saveNotification(
      first.userId,
      `${kind}:${first.source}:${first.loanId}:${first.dueDate}`,
      "loan_due",
      title,
      body,
      first.source === "dls" ? "/loans/current" : "/loans/current",
      payload
    );
    const sentCount = await sendToTokens(
      await getTokens(first.userId),
      title,
      body,
      payload
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
  if (!isFcmConfigured()) console.warn("FCM is not configured. Notifications will be stored without push delivery.");

  const q = notificationQueries.listNoticeNotificationTargets(notice.noticeId);
  const [rows] = await pool.query<NoticeRow[]>(q.sql, q.values);
  const grouped = groupByUser(rows);
  const title = `도서부 공지: ${notice.title}`;
  const body = notice.summary;
  let sentUsers = 0;

  for (const userRows of grouped.values()) {
    const first = userRows[0];
    const payload = { type: "notice", noticeId: String(notice.noticeId) };
    await saveNotification(
      first.userId,
      `NOTICE:notice:${notice.noticeId}`,
      "notice",
      title,
      body,
      "/notices",
      payload
    );
    const sentCount = await sendToTokens(
      await getTokens(first.userId),
      title,
      body,
      payload
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

export const sendNewBookNotification = async (book: { bookId: number; title: string; body?: string }) => {
  const q = notificationQueries.listNewBookNotificationTargets();
  const [rows] = await pool.query<NoticeRow[]>(q.sql, q.values);
  const title = "신간 도서 알림";
  const body = book.body ?? `새로 등록된 도서 '${book.title}'을 확인해 보세요.`;
  const payload = { type: "new_book", bookId: String(book.bookId) };
  let sentUsers = 0;

  for (const row of rows) {
    await saveNotification(
      row.userId,
      `NEW_BOOK:book:${book.bookId}`,
      "new_book",
      title,
      body,
      `/books/${book.bookId}`,
      payload
    );
    const sentCount = await sendToTokens(await getTokens(row.userId), title, body, payload);
    if (sentCount > 0) sentUsers += 1;
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
