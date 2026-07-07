import { Request, Response } from "express";
import { loanQueries, meQueries } from "../db/queries";
import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { ApiError, sendSuccess } from "../lib/api";

export const getMe = async (req: Request, res: Response) => {
  const q1 = loanQueries.markUserOverdueLoans(req.userId!);
  await pool.query(q1.sql, q1.values);

  const q2 = meQueries.findUserProfile(req.userId!);
  const [users] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);
  const user = users[0];
  if (!user) {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }

  const q3 = meQueries.getLoanSummary(req.userId!);
  const [summaries] = await pool.query<RowDataPacket[]>(q3.sql, q3.values);

  const q4 = meQueries.listUserCurrentLoans(req.userId!);
  const [currentLoans] = await pool.query<RowDataPacket[]>(q4.sql, q4.values);

  const { dueDateReminder, newBookReminder, ...profile } = user;
  sendSuccess(res, 200, "마이페이지 조회 성공", {
    user: profile,
    loanSummary: {
      currentLoanCount: Number(summaries[0].currentLoanCount),
      overdueCount: Number(summaries[0].overdueCount),
      nearestDueDate: summaries[0].nearestDueDate,
      nearestDueDday: summaries[0].nearestDueDday
    },
    currentLoans: currentLoans.map((loan) => ({
      ...loan,
      extensionAvailable: Boolean(loan.extensionAvailable)
    })),
    notificationSettings: {
      dueDateReminder: Boolean(dueDateReminder),
      newBookReminder: Boolean(newBookReminder)
    }
  });
};

export const updateNotificationSettings = async (req: Request, res: Response) => {
  const { dueDateReminder, newBookReminder } = req.body ?? {};
  if (dueDateReminder === undefined && newBookReminder === undefined) {
    throw new ApiError(400, 4001, "변경할 알림 설정을 입력해 주세요.");
  }
  if (
    (dueDateReminder !== undefined && typeof dueDateReminder !== "boolean") ||
    (newBookReminder !== undefined && typeof newBookReminder !== "boolean")
  ) {
    throw new ApiError(400, 4001, "알림 설정 값이 올바르지 않습니다.");
  }

  const updates: Record<string, unknown> = {};
  if (dueDateReminder !== undefined) updates.due_date_reminder = dueDateReminder;
  if (newBookReminder !== undefined) updates.new_book_reminder = newBookReminder;

  const q1 = meQueries.updateNotificationSettings(updates, req.userId!);
  await pool.query(q1.sql, q1.values);

  const q2 = meQueries.findNotificationSettings(req.userId!);
  const [users] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);
  sendSuccess(res, 200, "알림 설정이 변경되었습니다.", {
    dueDateReminder: Boolean(users[0].dueDateReminder),
    newBookReminder: Boolean(users[0].newBookReminder)
  });
};
