import { Request, Response } from "express";
import { publicQueries } from "../db/queries";
import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { ApiError, pagination, parsePositiveInteger, sendSuccess } from "../lib/api";
import { enrichDlsBooks, getDlsPopularBooks, serializeDlsBook } from "../services/dls";

export const listNotices = async (req: Request, res: Response) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 10, 100);

  const q1 = publicQueries.countNotices();
  const [countRows] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);

  const q2 = publicQueries.listNotices(size, (page - 1) * size);
  const [items] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);
  const totalCount = Number(countRows[0].totalCount);

  sendSuccess(res, 200, "공지사항 목록 조회 성공", {
    items,
    pagination: pagination(page, size, totalCount)
  });
};

export const getReaderRankings = async (req: Request, res: Response) => {
  if (req.query.year === undefined || req.query.limit === undefined) {
    throw new ApiError(400, 4001, "연도와 조회 개수를 입력해 주세요.");
  }
  const year = parsePositiveInteger(req.query.year, new Date().getFullYear());
  const limit = parsePositiveInteger(req.query.limit, 100, 100);
  if (year < 2000 || year > 2100) {
    throw new ApiError(400, 4001, "연도 값이 올바르지 않습니다.");
  }

  const q = publicQueries.getReaderRankings(year, limit);
  const [rows] = await pool.query<RowDataPacket[]>(q.sql, q.values);

  sendSuccess(res, 200, "다독 학생 랭킹 조회 성공", {
    year,
    resetPolicy: "매년 1월 1일 00:00에 연간 랭킹이 초기화됩니다.",
    items: rows.map((row, index) => ({
      rank: index + 1,
      ...row,
      loanCount: Number(row.loanCount)
    }))
  });
};

export const getHome = async (req: Request, res: Response) => {
  const limit = parsePositiveInteger(req.query.limit, 5, 20);

  const q = publicQueries.listBanners(limit);
  const [banners] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  const popularBooks = (await getDlsPopularBooks()).slice(0, 1);
  const recommendations = await enrichDlsBooks(popularBooks);

  sendSuccess(res, 200, "메인 화면 조회 성공", {
    banners,
    todayRecommendation: recommendations[0]
      ? {
          ...serializeDlsBook(recommendations[0].book, recommendations[0].state),
          reason: "학교 도서관의 실제 대출 통계를 기반으로 추천되었습니다."
        }
      : null,
    menus: [
      { code: "RANKING", name: "랭킹", path: "/ranking" },
      { code: "LIBRARY", name: "도서실", path: "/library" },
      { code: "NEW_BOOKS", name: "신간추천", path: "/new-books" }
    ]
  });
};
