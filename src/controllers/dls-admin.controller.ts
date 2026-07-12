import { Request, Response } from "express";
import { ApiError, sendSuccess } from "../lib/api";
import {
  ensureDlsAdminSession,
  extendDlsLoan,
  getDlsAdminSessionStatus,
  getDlsAdminBook,
  getDlsBookInfoByRegNos,
  getDlsCurrentLoans,
  getDlsLoanCount,
  getDlsLoanHistory,
  getDlsLoanHistoryByUserKey,
  getDlsUser,
  searchDlsBooksByTitle,
  searchDlsUsers,
  searchDlsUsersByName
} from "../services/dls-admin";

const queryFrom = (req: Request) => {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      query[key] = value;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      query[key] = value as string[];
    }
  }
  return query;
};

const audit = (action: string, target?: string) => {
  console.info(JSON.stringify({
    type: "DLS_ADMIN_ACCESS",
    action,
    target: target ?? null,
    at: new Date().toISOString()
  }));
};

const requireQueryString = (value: unknown, name: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, 4001, `${name} 값이 필요합니다.`);
  }
  return value.trim();
};

export const createDlsSession = async (_req: Request, res: Response) => {
  await ensureDlsAdminSession();
  audit("SESSION_CREATED");
  sendSuccess(res, 200, "DLS 관리자 세션이 등록되었습니다.", getDlsAdminSessionStatus());
};

export const getDlsSession = async (_req: Request, res: Response) => {
  sendSuccess(res, 200, "DLS 관리자 세션 상태 조회 성공", getDlsAdminSessionStatus());
};

export const searchUsers = async (req: Request, res: Response) => {
  audit("USER_SEARCH");
  sendSuccess(res, 200, "DLS 사용자 검색 성공", await searchDlsUsers(queryFrom(req)));
};

export const searchStudents = async (req: Request, res: Response) => {
  const name = requireQueryString(req.query.name ?? req.query.keyword, "name");
  audit("STUDENT_SEARCH", name);
  sendSuccess(res, 200, "DLS 학생 검색 성공", await searchDlsUsersByName(name));
};

export const getUser = async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  audit("USER_DETAIL", userId);
  sendSuccess(res, 200, "DLS 사용자 정보 조회 성공", await getDlsUser(userId));
};

export const getLoanCount = async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  audit("LOAN_COUNT", userId);
  sendSuccess(res, 200, "DLS 대출 권수 조회 성공", await getDlsLoanCount(userId));
};

export const getLoanHistory = async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  audit("LOAN_HISTORY", userId);
  sendSuccess(res, 200, "DLS 대출 기록 조회 성공", await getDlsLoanHistory(userId, queryFrom(req)));
};

export const getCurrentLoans = async (req: Request, res: Response) => {
  const userKey = String(req.params.userKey);
  const userNo = requireQueryString(req.query.userNo, "userNo");
  audit("CURRENT_LOANS", userKey);
  sendSuccess(res, 200, "DLS 현재 대출 조회 성공", await getDlsCurrentLoans(userKey, userNo));
};

export const getLoanHistoryByUserKey = async (req: Request, res: Response) => {
  const userKey = String(req.params.userKey);
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  audit("LOAN_HISTORY_BY_USER_KEY", userKey);
  sendSuccess(
    res,
    200,
    "DLS 사용자별 대출 기록 조회 성공",
    await getDlsLoanHistoryByUserKey(userKey, startDate, endDate)
  );
};

export const searchBooks = async (req: Request, res: Response) => {
  const query = requireQueryString(req.query.query ?? req.query.keyword, "query");
  audit("BOOK_SEARCH", query);
  sendSuccess(res, 200, "DLS 도서 검색 성공", await searchDlsBooksByTitle(query));
};

export const getBookInfo = async (req: Request, res: Response) => {
  const regNos = requireQueryString(req.query.regNos ?? req.query.reg_no, "regNos");
  audit("BOOK_INFO", regNos);
  sendSuccess(res, 200, "DLS 도서 정보 조회 성공", await getDlsBookInfoByRegNos(regNos));
};

export const getBook = async (req: Request, res: Response) => {
  const bookId = String(req.params.bookId);
  audit("BOOK_DETAIL", bookId);
  sendSuccess(res, 200, "DLS 도서 정보 조회 성공", await getDlsAdminBook(bookId));
};

export const extendLoan = async (req: Request, res: Response) => {
  const userKey = requireQueryString(req.body?.userKey ?? req.body?.user_key, "userKey");
  const loanKey = requireQueryString(req.body?.loanKey ?? req.body?.loan_key, "loanKey");
  audit("LOAN_EXTEND", `${userKey}:${loanKey}`);
  sendSuccess(res, 200, "DLS 대출 연장 성공", await extendDlsLoan(userKey, loanKey));
};
