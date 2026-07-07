import { Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { bookQueries } from "../db/queries";
import { pool } from "../db/pool";
import { ApiError, parseId, pagination, parsePositiveInteger, sendSuccess } from "../lib/api";
import { BookRow } from "../types/book.types";

const serializeBook = (book: BookRow) => ({
  ...book,
  loanAvailable: Boolean(book.loanAvailable),
  ...(book.favorite === undefined ? {} : { favorite: Boolean(book.favorite) })
});

export const addFavorite = async (req: Request, res: Response) => {
  const bookId = parseId(req.params.bookId, "도서 ID");
  const q1 = bookQueries.findBookById(bookId);
  const [books] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);
  if (!books[0]) {
    throw new ApiError(404, 4042, "도서를 찾을 수 없습니다.");
  }

  try {
    const q2 = bookQueries.insertFavorite(req.userId!, bookId);
    await pool.query<ResultSetHeader>(q2.sql, q2.values);
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new ApiError(409, 4096, "이미 관심 도서로 등록된 책입니다.", { bookId });
    }
    throw error;
  }
  sendSuccess(res, 201, "관심 도서로 등록되었습니다.", { bookId, favorite: true });
};

export const removeFavorite = async (req: Request, res: Response) => {
  const bookId = parseId(req.params.bookId, "도서 ID");
  const q = bookQueries.deleteFavorite(req.userId!, bookId);
  await pool.query(q.sql, q.values);
  sendSuccess(res, 200, "관심 도서 등록이 해제되었습니다.", { bookId, favorite: false });
};

export const listFavoriteBooks = async (req: Request, res: Response) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);

  const q1 = bookQueries.countFavorites(req.userId!);
  const [countRows] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);

  const q2 = bookQueries.listFavoriteBooks(req.userId!, size, (page - 1) * size);
  const [books] = await pool.query<BookRow[]>(q2.sql, q2.values);
  const totalCount = Number(countRows[0].totalCount);

  sendSuccess(res, 200, "관심 도서 목록 조회 성공", {
    items: books.map(serializeBook),
    pagination: pagination(page, size, totalCount)
  });
};
