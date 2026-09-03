import { Request, Response } from "express";
import { loanQueries, meQueries } from "../db/queries";
import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { ApiError, sendSuccess } from "../lib/api";
import { getDlsCurrentLoan, isDlsServiceError } from "../services/dls";
import {
  deleteProfileImage,
  findProfileImageMetaByEmail,
  saveProfileImage
} from "../services/profile-image";

type MeLoanData = {
  loanSummary: {
    currentLoanCount: number;
    overdueCount: number;
    nearestDueDate: string | null;
    nearestDueDday: number | null;
  };
  currentLoans: Array<Record<string, unknown>>;
};

const toText = (value: unknown) => (value === undefined || value === null ? "" : String(value));

const toNullableText = (value: unknown) => {
  const text = toText(value).trim();
  return text || null;
};

const normalizeDate = (value: unknown) => {
  const text = toText(value).trim();
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return text ? text.slice(0, 10) : null;
};

const dDay = (date: string | null) => {
  if (!date) {
    return null;
  }
  const target = Date.parse(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(target)) {
    return null;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const todayTime = Date.parse(`${today}T00:00:00+09:00`);
  return Math.trunc((target - todayTime) / 86400000);
};

const isDlsLoanActive = (loan: RowDataPacket) => {
  const returnDate = toNullableText(loan.rtn_date);
  const status = toText(loan.loan_status || loan.loan_status_desc);
  return !returnDate && !/반납|RETURN/i.test(status);
};

const getLocalMeLoanData = async (userId: number): Promise<MeLoanData> => {
  const q1 = meQueries.getLoanSummary(userId);
  const [summaries] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);

  const q2 = meQueries.listUserCurrentLoans(userId);
  const [currentLoans] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);

  return {
    loanSummary: {
      currentLoanCount: Number(summaries[0].currentLoanCount),
      overdueCount: Number(summaries[0].overdueCount),
      nearestDueDate: summaries[0].nearestDueDate,
      nearestDueDday: summaries[0].nearestDueDday
    },
    currentLoans: currentLoans.map((loan) => ({
      ...loan,
      extensionAvailable: Boolean(loan.extensionAvailable)
    }))
  };
};

const getDlsMeLoanData = async (userId: number): Promise<MeLoanData | null> => {
  const q = meQueries.findDlsIdentity(userId);
  const [rows] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  const userKey = toNullableText(rows[0]?.userKey);
  const userNo = toNullableText(rows[0]?.userNo);
  if (!userKey || !userNo) {
    return null;
  }

  try {
    const data = await getDlsCurrentLoan(userKey, userNo);
    const loans = Array.isArray(data.user_loan_list) ? data.user_loan_list as RowDataPacket[] : [];
    const activeLoans = loans.filter(isDlsLoanActive);
    const currentLoans = activeLoans.map((loan) => {
      const dueDate = normalizeDate(loan.rtn_plan_date);
      const extensionCount = Number(loan.extend_cnt ?? 0);
      return {
        loanId: toText(loan.loan_key),
        bookId: Number(loan.holding_key || loan.bib_key || 0) || null,
        title: toText(loan.title),
        author: toText(loan.aut_nm),
        borrowedAt: normalizeDate(loan.loan_date),
        dueDate,
        dDay: dDay(dueDate),
        extensionAvailable: extensionCount === 0,
        status: toText(loan.loan_status || loan.loan_status_desc) || null,
        source: "dls",
        libraryNumber: toText(loan.call_no || loan.reg_no)
      };
    });
    const dueDates = currentLoans
      .map((loan) => loan.dueDate)
      .filter((date): date is string => typeof date === "string")
      .sort();
    const nearestDueDate = dueDates[0] ?? null;
    return {
      loanSummary: {
        currentLoanCount: currentLoans.length,
        overdueCount: currentLoans.filter((loan) => typeof loan.dDay === "number" && loan.dDay < 0).length,
        nearestDueDate,
        nearestDueDday: dDay(nearestDueDate)
      },
      currentLoans
    };
  } catch (error) {
    if (isDlsServiceError(error)) {
      return null;
    }
    throw error;
  }
};

export const getMe = async (req: Request, res: Response) => {
  const q1 = loanQueries.markUserOverdueLoans(req.userId!);
  await pool.query(q1.sql, q1.values);

  const q2 = meQueries.findUserProfile(req.userId!);
  const [users] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);
  const user = users[0];
  if (!user) {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }

  const loanData = await getDlsMeLoanData(req.userId!) ?? await getLocalMeLoanData(req.userId!);

  const { dueDateReminder, newBookReminder, noticeReminder, ...profile } = user;
  const profileImage = findProfileImageMetaByEmail(user.email);
  sendSuccess(res, 200, "마이페이지 조회 성공", {
    user: {
      ...profile,
      profileImageUrl: profileImage?.profileImageUrl ?? null
    },
    loanSummary: loanData.loanSummary,
    currentLoans: loanData.currentLoans,
    notificationSettings: {
      dueDateReminder: Boolean(dueDateReminder),
      newBookReminder: Boolean(newBookReminder),
      noticeReminder: Boolean(noticeReminder)
    }
  });
};

export const updateProfileImage = async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new ApiError(400, 4001, "이미지 데이터를 입력해 주세요.");
  }

  const q = meQueries.findUserProfile(req.userId!);
  const [users] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  const user = users[0];
  if (!user) {
    throw new ApiError(401, 4010, "?몄쬆???꾩슂?⑸땲??");
  }

  const saved = saveProfileImage(user.email, req.header("content-type") ?? "", req.body);
  if (!saved) {
    throw new ApiError(400, 4001, "지원하지 않는 이미지 형식입니다.");
  }

  sendSuccess(res, 200, "프로필 사진이 변경되었습니다.", {
    profileImageUrl: saved.profileImageUrl
  });
};

export const deleteMyProfileImage = async (req: Request, res: Response) => {
  const q = meQueries.findUserProfile(req.userId!);
  const [users] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  const user = users[0];
  if (!user) {
    throw new ApiError(401, 4010, "?몄쬆???꾩슂?⑸땲??");
  }

  deleteProfileImage(user.email);
  sendSuccess(res, 200, "프로필 사진이 기본 이미지로 초기화되었습니다.", {
    profileImageUrl: null
  });
};

export const updateNotificationSettings = async (req: Request, res: Response) => {
  const { dueDateReminder, newBookReminder, noticeReminder } = req.body ?? {};
  if (dueDateReminder === undefined && newBookReminder === undefined && noticeReminder === undefined) {
    throw new ApiError(400, 4001, "변경할 알림 설정을 입력해 주세요.");
  }
  if (
    (dueDateReminder !== undefined && typeof dueDateReminder !== "boolean") ||
    (newBookReminder !== undefined && typeof newBookReminder !== "boolean") ||
    (noticeReminder !== undefined && typeof noticeReminder !== "boolean")
  ) {
    throw new ApiError(400, 4001, "알림 설정 값이 올바르지 않습니다.");
  }

  const updates: Record<string, unknown> = {};
  if (dueDateReminder !== undefined) updates.due_date_reminder = dueDateReminder;
  if (newBookReminder !== undefined) updates.new_book_reminder = newBookReminder;
  if (noticeReminder !== undefined) updates.notice_reminder = noticeReminder;

  const q1 = meQueries.updateNotificationSettings(updates, req.userId!);
  await pool.query(q1.sql, q1.values);

  const q2 = meQueries.findNotificationSettings(req.userId!);
  const [users] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);
  sendSuccess(res, 200, "알림 설정이 변경되었습니다.", {
    dueDateReminder: Boolean(users[0].dueDateReminder),
    newBookReminder: Boolean(users[0].newBookReminder),
    noticeReminder: Boolean(users[0].noticeReminder)
  });
};
