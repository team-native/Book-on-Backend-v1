import { Request, Response } from "express";
import { ApiError, sendSuccess } from "../lib/api";
import {
  executeDlsLoanReturn,
  extendDlsLoan,
  getDlsBookInfo,
  getDlsCurrentLoan,
  getDlsLoanHistory,
  getDlsReturnDate,
  searchDlsBookRaw,
  searchDlsStudent,
} from "../services/dls";

const getRequiredQuery = (req: Request, key: string) => {
  const value = req.query[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, 4001, `${key} query parameter is required`);
  }
  return value.trim();
};

const getOptionalQuery = (req: Request, key: string) => {
  const value = req.query[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export const getReturnDate = async (_req: Request, res: Response) => {
  const data = await getDlsReturnDate();
  sendSuccess(res, 200, "DLS 반납 예정일 조회 성공", data);
};

export const searchStudent = async (req: Request, res: Response) => {
  const name = getRequiredQuery(req, "name");
  const data = await searchDlsStudent(name);
  sendSuccess(res, 200, "DLS 학생 검색 성공", data);
};

export const getCurrentLoan = async (req: Request, res: Response) => {
  const userKey = getRequiredQuery(req, "user_key");
  const userNo = getRequiredQuery(req, "user_no");
  const data = await getDlsCurrentLoan(userKey, userNo);
  sendSuccess(res, 200, "DLS 현재 대출 목록 조회 성공", data);
};

export const getBookInfo = async (req: Request, res: Response) => {
  const regNos = getRequiredQuery(req, "reg_nos");
  const data = await getDlsBookInfo(regNos);
  sendSuccess(res, 200, "DLS 도서 정보 조회 성공", data);
};

export const getLoanHistory = async (req: Request, res: Response) => {
  const userKey = getRequiredQuery(req, "user_key");
  const endDate = getOptionalQuery(req, "end_date");
  const startDate = getOptionalQuery(req, "start_date");
  const data = await getDlsLoanHistory(userKey, endDate, startDate);
  sendSuccess(res, 200, "DLS 대출 이력 조회 성공", data);
};

export const executeLoanReturn = async (req: Request, res: Response) => {
  const regNo = getRequiredQuery(req, "reg_no");
  const userKey = getRequiredQuery(req, "user_key");
  const data = await executeDlsLoanReturn(regNo, userKey);
  sendSuccess(res, 200, "DLS 대출/반납 실행 성공", data);
};

export const searchBook = async (req: Request, res: Response) => {
  const query = getRequiredQuery(req, "query");
  const data = await searchDlsBookRaw(query);
  sendSuccess(res, 200, "DLS 도서 검색 성공", data);
};

export const extendLoan = async (req: Request, res: Response) => {
  const userKey = getRequiredQuery(req, "user_key");
  const loanKey = getRequiredQuery(req, "loan_key");
  const data = await extendDlsLoan(userKey, loanKey);
  sendSuccess(res, 200, "DLS 대출 연장 성공", data);
};
