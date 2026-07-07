import { Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { ApiError, pagination, parsePositiveInteger, sendSuccess } from "../lib/api";
import { getDlsBookDetail } from "../services/dls";

type LoanRow = RowDataPacket & {
  id: number;
  user_id: number;
  due_date: string;
  status: "BORROWED" | "RETURNED" | "OVERDUE";
  extension_count: number;
};

const parseId = (value: string, label: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, 4001, `${label}가 올바르지 않습니다.`);
  }
  return id;
};

const updateOverdueLoans = async () => {
  await pool.query(
    "UPDATE loans SET status = 'OVERDUE' WHERE status = 'BORROWED' AND due_date < CURRENT_DATE"
  );
};

export const createLoan = async (req: Request, res: Response) => {
  const bookId = parseId(String(req.body?.bookId ?? ""), "도서 ID");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [books] = await connection.query<RowDataPacket[]>(
      "SELECT id, title, total_quantity, library_number FROM books WHERE id = ? FOR UPDATE",
      [bookId]
    );
    const book = books[0];
    if (!book) {
      throw new ApiError(404, 4042, "도서를 찾을 수 없습니다.");
    }
    const speciesKey = String(book.library_number ?? "").startsWith("DLS:")
      ? String(book.library_number).split(":")[1]
      : undefined;
    if (speciesKey) {
      const detail = await getDlsBookDetail(String(bookId), speciesKey);
      if (detail.status !== "대출가능" && detail.status !== "비치도서") {
        throw new ApiError(409, 4092, "현재 대출 가능한 재고가 없습니다.", {
          bookId,
          availableQuantity: 0
        });
      }
    }

    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('BORROWED', 'OVERDUE') LIMIT 1",
      [req.userId, bookId]
    );
    if (existing[0]) {
      throw new ApiError(409, 4093, "이미 대출 중인 도서입니다.", { bookId });
    }

    const [activeRows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS loanedQuantity FROM loans WHERE book_id = ? AND status IN ('BORROWED', 'OVERDUE')",
      [bookId]
    );
    const availableQuantity = Number(book.total_quantity) - Number(activeRows[0].loanedQuantity);
    if (availableQuantity < 1) {
      throw new ApiError(409, 4092, "현재 대출 가능한 재고가 없습니다.", {
        bookId,
        availableQuantity: 0
      });
    }

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO loans (user_id, book_id, borrowed_at, due_date) VALUES (?, ?, CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL ${env.loanDays} DAY))`,
      [req.userId, bookId]
    );
    const [loans] = await connection.query<RowDataPacket[]>(
      "SELECT id AS loanId, book_id AS bookId, borrowed_at AS borrowedAt, due_date AS dueDate, status FROM loans WHERE id = ?",
      [result.insertId]
    );
    await connection.commit();

    sendSuccess(res, 200, "대출 신청이 완료되었습니다.", {
      ...loans[0],
      title: book.title
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const extendLoan = async (req: Request, res: Response) => {
  const loanId = parseId(String(req.params.loanId), "대출 ID");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      "UPDATE loans SET status = 'OVERDUE' WHERE id = ? AND status = 'BORROWED' AND due_date < CURRENT_DATE",
      [loanId]
    );
    const [loans] = await connection.query<LoanRow[]>(
      "SELECT id, user_id, due_date, status, extension_count FROM loans WHERE id = ? AND user_id = ? FOR UPDATE",
      [loanId, req.userId]
    );
    const loan = loans[0];
    if (!loan) {
      throw new ApiError(404, 4043, "대출 정보를 찾을 수 없습니다.");
    }
    if (loan.status === "OVERDUE") {
      throw new ApiError(409, 4095, "연체 중인 도서는 연장할 수 없습니다.", {
        loanId,
        status: loan.status
      });
    }
    if (loan.status !== "BORROWED") {
      throw new ApiError(409, 4095, "현재 대출 중인 도서만 연장할 수 있습니다.", { loanId });
    }
    if (loan.extension_count > 0) {
      throw new ApiError(409, 4094, "이미 연장한 대출입니다.", {
        loanId,
        extensionCount: loan.extension_count
      });
    }

    await connection.query(
      `UPDATE loans SET due_date = DATE_ADD(due_date, INTERVAL ${env.extensionDays} DAY), extension_count = extension_count + 1 WHERE id = ?`,
      [loanId]
    );
    const [updated] = await connection.query<RowDataPacket[]>(
      "SELECT due_date AS newDueDate, extension_count AS extensionCount FROM loans WHERE id = ?",
      [loanId]
    );
    await connection.commit();

    sendSuccess(res, 200, "대출 기간이 연장되었습니다.", {
      loanId,
      previousDueDate: loan.due_date,
      newDueDate: updated[0].newDueDate,
      extensionCount: updated[0].extensionCount,
      extensionAvailable: false
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const listCurrentLoans = async (req: Request, res: Response) => {
  await updateOverdueLoans();
  const [items] = await pool.query<RowDataPacket[]>(`
    SELECT
      l.id AS loanId,
      b.id AS bookId,
      b.title,
      b.author,
      l.borrowed_at AS borrowedAt,
      l.due_date AS dueDate,
      DATEDIFF(l.due_date, CURRENT_DATE) AS dDay,
      l.extension_count = 0 AND l.status = 'BORROWED' AS extensionAvailable,
      l.status
    FROM loans l
    JOIN books b ON b.id = l.book_id
    WHERE l.user_id = ? AND l.status IN ('BORROWED', 'OVERDUE')
    ORDER BY l.due_date ASC
  `, [req.userId]);

  sendSuccess(res, 200, "현재 대출 목록 조회 성공", {
    items: items.map((item) => ({
      ...item,
      extensionAvailable: Boolean(item.extensionAvailable)
    }))
  });
};

export const listLoanHistory = async (req: Request, res: Response) => {
  await updateOverdueLoans();
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "ALL";
  if (!['ALL', 'RETURNED', 'OVERDUE', 'BORROWED'].includes(status)) {
    throw new ApiError(400, 4001, "대출 상태 값이 올바르지 않습니다.");
  }

  const condition = status === "ALL" ? "" : "AND l.status = ?";
  const params = status === "ALL" ? [req.userId] : [req.userId, status];
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS totalCount FROM loans l WHERE l.user_id = ? ${condition}`,
    params
  );
  const [items] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        l.id AS loanId,
        b.id AS bookId,
        b.title,
        l.borrowed_at AS borrowedAt,
        l.due_date AS dueDate,
        l.returned_at AS returnedAt,
        l.status
      FROM loans l
      JOIN books b ON b.id = l.book_id
      WHERE l.user_id = ? ${condition}
      ORDER BY l.borrowed_at DESC, l.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, size, (page - 1) * size]
  );
  const totalCount = Number(countRows[0].totalCount);

  sendSuccess(res, 200, "대출 히스토리 조회 성공", {
    items,
    pagination: pagination(page, size, totalCount)
  });
};
