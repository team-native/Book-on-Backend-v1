import { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import { pool } from "../db/pool";
import { ApiError, sendSuccess } from "../lib/api";

export const getMe = async (req: Request, res: Response) => {
  await pool.query(
    "UPDATE loans SET status = 'OVERDUE' WHERE user_id = ? AND status = 'BORROWED' AND due_date < CURRENT_DATE",
    [req.userId]
  );

  const [users] = await pool.query<RowDataPacket[]>(`
    SELECT
      id AS userId,
      email,
      name,
      department,
      gender,
      due_date_reminder AS dueDateReminder,
      new_book_reminder AS newBookReminder
    FROM users
    WHERE id = ?
  `, [req.userId]);
  const user = users[0];
  if (!user) {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }

  const [summaries] = await pool.query<RowDataPacket[]>(`
    SELECT
      COUNT(*) AS currentLoanCount,
      COALESCE(SUM(status = 'OVERDUE'), 0) AS overdueCount,
      MIN(due_date) AS nearestDueDate,
      DATEDIFF(MIN(due_date), CURRENT_DATE) AS nearestDueDday
    FROM loans
    WHERE user_id = ? AND status IN ('BORROWED', 'OVERDUE')
  `, [req.userId]);
  const [currentLoans] = await pool.query<RowDataPacket[]>(`
    SELECT
      l.id AS loanId,
      b.id AS bookId,
      b.title,
      l.due_date AS dueDate,
      DATEDIFF(l.due_date, CURRENT_DATE) AS dDay,
      l.extension_count = 0 AND l.status = 'BORROWED' AS extensionAvailable
    FROM loans l
    JOIN books b ON b.id = l.book_id
    WHERE l.user_id = ? AND l.status IN ('BORROWED', 'OVERDUE')
    ORDER BY l.due_date ASC
  `, [req.userId]);

  const {
    dueDateReminder,
    newBookReminder,
    ...profile
  } = user;
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

  const updates: string[] = [];
  const params: unknown[] = [];
  if (dueDateReminder !== undefined) {
    updates.push("due_date_reminder = ?");
    params.push(dueDateReminder);
  }
  if (newBookReminder !== undefined) {
    updates.push("new_book_reminder = ?");
    params.push(newBookReminder);
  }
  await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, [
    ...params,
    req.userId
  ]);

  const [users] = await pool.query<RowDataPacket[]>(
    "SELECT due_date_reminder AS dueDateReminder, new_book_reminder AS newBookReminder FROM users WHERE id = ?",
    [req.userId]
  );
  sendSuccess(res, 200, "알림 설정이 변경되었습니다.", {
    dueDateReminder: Boolean(users[0].dueDateReminder),
    newBookReminder: Boolean(users[0].newBookReminder)
  });
};
