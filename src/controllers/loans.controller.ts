import { Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { loanQueries } from "../db/queries";
import { pool } from "../db/pool";
import { ApiError, parseId, pagination, parsePositiveInteger, sendSuccess } from "../lib/api";
import { getDlsBookDetail } from "../services/dls";
import { LoanRow } from "../types/loan.types";

const updateOverdueLoans = async () => {
  const q = loanQueries.markOverdueLoans();
  await pool.query(q.sql, q.values);
};

export const createLoan = async (req: Request, res: Response) => {
  const bookId = parseId(String(req.body?.bookId ?? ""), "도서 ID");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const q1 = loanQueries.findBookForLoan(bookId);
    const [books] = await connection.query<RowDataPacket[]>(q1.sql, q1.values);
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

    const q2 = loanQueries.findActiveLoanByUserAndBook(req.userId!, bookId);
    const [existing] = await connection.query<RowDataPacket[]>(q2.sql, q2.values);
    if (existing[0]) {
      throw new ApiError(409, 4093, "이미 대출 중인 도서입니다.", { bookId });
    }

    const q3 = loanQueries.countActiveLoansByBook(bookId);
    const [activeRows] = await connection.query<RowDataPacket[]>(q3.sql, q3.values);
    const availableQuantity = Number(book.total_quantity) - Number(activeRows[0].loanedQuantity);
    if (availableQuantity < 1) {
      throw new ApiError(409, 4092, "현재 대출 가능한 재고가 없습니다.", {
        bookId,
        availableQuantity: 0
      });
    }

    const q4 = loanQueries.insertLoan(req.userId!, bookId);
    const [result] = await connection.query<ResultSetHeader>(q4.sql, q4.values);

    const q5 = loanQueries.findLoanById(result.insertId);
    const [loans] = await connection.query<RowDataPacket[]>(q5.sql, q5.values);
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
  const loanId = parseId(req.params.loanId, "대출 ID");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const q1 = loanQueries.markSingleLoanOverdue(loanId);
    await connection.query(q1.sql, q1.values);

    const q2 = loanQueries.findLoanForExtension(loanId, req.userId!);
    const [loans] = await connection.query<LoanRow[]>(q2.sql, q2.values);
    const loan = loans[0];
    if (!loan) {
      throw new ApiError(404, 4043, "대출 정보를 찾을 수 없습니다.");
    }
    if (loan.status !== "BORROWED") {
      const message = loan.status === "OVERDUE"
        ? "연체 중인 도서는 연장할 수 없습니다."
        : "현재 대출 중인 도서만 연장할 수 있습니다.";
      throw new ApiError(409, 4095, message, { loanId, status: loan.status });
    }
    if (loan.extension_count > 0) {
      throw new ApiError(409, 4094, "이미 연장한 대출입니다.", {
        loanId,
        extensionCount: loan.extension_count
      });
    }

    const q3 = loanQueries.extendLoanDueDate(loanId);
    await connection.query(q3.sql, q3.values);

    const q4 = loanQueries.findExtendedLoan(loanId);
    const [updated] = await connection.query<RowDataPacket[]>(q4.sql, q4.values);
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
  const q = loanQueries.listCurrentLoans(req.userId!);
  const [items] = await pool.query<RowDataPacket[]>(q.sql, q.values);

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

  const q1 = loanQueries.countLoanHistory(req.userId!, status);
  const [countRows] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);

  const q2 = loanQueries.listLoanHistory(req.userId!, status, size, (page - 1) * size);
  const [items] = await pool.query<RowDataPacket[]>(q2.sql, q2.values);
  const totalCount = Number(countRows[0].totalCount);

  sendSuccess(res, 200, "대출 히스토리 조회 성공", {
    items,
    pagination: pagination(page, size, totalCount)
  });
};
