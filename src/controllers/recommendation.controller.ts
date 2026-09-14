import { Request, Response } from "express";
import { ApiError, sendSuccess } from "../lib/api";
import { recommendBooks, RecommendationBook } from "../services/book-recommendation";

export const recommendForUser = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const topK = body.top_k ?? 5;
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) throw new ApiError(400, 4001, "top_k는 1에서 20 사이여야 합니다.");
  if (!Array.isArray(body.books)) throw new ApiError(400, 4001, "books 배열이 필요합니다.");
  if (body.user_id !== undefined && typeof body.user_id !== "string" && typeof body.user_id !== "number") throw new ApiError(400, 4001, "user_id 형식이 올바르지 않습니다.");
  if (body.books.some((book: unknown) => !book || typeof book !== "object" || Array.isArray(book))) {
    throw new ApiError(400, 4001, "books 안의 책 데이터 형식이 올바르지 않습니다.");
  }
  const result = recommendBooks(body.books as RecommendationBook[], topK);
  sendSuccess(res, 200, "AI 도서 추천 조회 성공", { user_id: body.user_id ?? req.userId, ...result });
};
