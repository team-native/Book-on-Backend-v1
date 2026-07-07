import { Request, Response } from "express";
import { sendSuccess } from "../lib/api";
import {
  ensureDlsAdminSession,
  getDlsAdminBook,
  getDlsAdminSessionStatus,
  getDlsLoanCount,
  getDlsLoanHistory,
  getDlsUser,
  searchDlsUsers
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
  sendSuccess(
    res,
    200,
    "DLS 대출 기록 조회 성공",
    await getDlsLoanHistory(userId, queryFrom(req))
  );
};

export const getBook = async (req: Request, res: Response) => {
  const bookId = String(req.params.bookId);
  audit("BOOK_DETAIL", bookId);
  sendSuccess(res, 200, "DLS 도서 정보 조회 성공", await getDlsAdminBook(bookId));
};
