import { Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../db/pool";
import { ApiError, pagination, parsePositiveInteger, sendSuccess } from "../lib/api";

type BookRow = RowDataPacket & {
  bookId: number;
  loanAvailable: number;
  favorite?: number;
};

const bookAvailabilitySql = `
  LEFT JOIN (
    SELECT book_id, COUNT(*) AS loaned_quantity
    FROM loans
    WHERE status IN ('BORROWED', 'OVERDUE')
    GROUP BY book_id
  ) active_loans ON active_loans.book_id = b.id
`;

const serializeBook = (book: BookRow) => ({
  ...book,
  loanAvailable: Boolean(book.loanAvailable),
  ...(book.favorite === undefined ? {} : { favorite: Boolean(book.favorite) })
});

const parseBookId = (value: string) => {
  const bookId = Number(value);
  if (!Number.isInteger(bookId) || bookId < 1) {
    throw new ApiError(400, 4001, "도서 ID가 올바르지 않습니다.");
  }
  return bookId;
};

export const addFavorite = async (req: Request, res: Response) => {
  const bookId = parseBookId(String(req.params.bookId));
  const [books] = await pool.query<RowDataPacket[]>("SELECT id FROM books WHERE id = ?", [bookId]);
  if (!books[0]) {
    throw new ApiError(404, 4042, "도서를 찾을 수 없습니다.");
  }

  try {
    await pool.query<ResultSetHeader>("INSERT INTO favorites (user_id, book_id) VALUES (?, ?)", [
      req.userId,
      bookId
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new ApiError(409, 4096, "이미 관심 도서로 등록된 책입니다.", { bookId });
    }
    throw error;
  }
  sendSuccess(res, 201, "관심 도서로 등록되었습니다.", { bookId, favorite: true });
};

export const removeFavorite = async (req: Request, res: Response) => {
  const bookId = parseBookId(String(req.params.bookId));
  await pool.query("DELETE FROM favorites WHERE user_id = ? AND book_id = ?", [
    req.userId,
    bookId
  ]);
  sendSuccess(res, 200, "관심 도서 등록이 해제되었습니다.", { bookId, favorite: false });
};

export const listFavoriteBooks = async (req: Request, res: Response) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);
  const [countRows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS totalCount FROM favorites WHERE user_id = ?",
    [req.userId]
  );
  const [books] = await pool.query<BookRow[]>(
    `
      SELECT
        b.id AS bookId,
        b.title,
        b.author,
        b.library_number AS libraryNumber,
        b.total_quantity - COALESCE(active_loans.loaned_quantity, 0) AS availableQuantity,
        b.total_quantity > COALESCE(active_loans.loaned_quantity, 0) AS loanAvailable,
        f.created_at AS favoritedAt
      FROM favorites f
      JOIN books b ON b.id = f.book_id
      ${bookAvailabilitySql}
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `,
    [req.userId, size, (page - 1) * size]
  );
  const totalCount = Number(countRows[0].totalCount);

  sendSuccess(res, 200, "관심 도서 목록 조회 성공", {
    items: books.map(serializeBook),
    pagination: pagination(page, size, totalCount)
  });
};
