import { env } from "../config/env";
import { bookQueries } from "../db/queries";
import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { ApiError } from "../lib/api";
import {
  DlsBook,
  DlsBookState,
  DlsCategory,
  DlsSearchResult,
  SearchOptions,
} from "../types/dls.types";

export type { DlsBook, DlsBookState, DlsCategory };

type DlsProxyEnvelope<T> = {
  success?: boolean;
  status?: "SUCCESS" | "WARNING" | string;
  message?: string;
  data?: T;
};

type DlsProxyBook = {
  reg_code?: string | null;
  reg_no?: string | null;
  title?: string | null;
  aut_nm?: string | null;
  publisher?: string | null;
  pblcn_yr?: string | number | null;
  cover_img_path?: string | null;
  ea_isbn?: string | null;
  call_no?: string | null;
  location?: string | null;
  location_desc?: string | null;
  location_nm?: string | null;
  reg_date?: string | null;
  update_date?: string | null;
  status?: string | null;
  status_desc?: string | null;
  class_no?: string | null;
  holding_key?: string | number | null;
  bib_key?: string | number | null;
  rtn_plan_date?: string | number | null;
};

type DlsProxyBookList = {
  count?: number;
  bookList?: DlsProxyBook[];
  statusDescription?: string;
  statusDescrition?: string;
};

export type DlsProxyData = Record<string, unknown>;

type DlsProxyStudent = {
  user_key?: string | number | null;
  user_no?: string | null;
  name?: string | null;
  user_nm?: string | null;
  user_class?: string | null;
  user_class_nm?: string | null;
  school_nm?: string | null;
  user_status?: string | null;
  loan_status?: string | null;
};

type DlsProxyLoan = DlsProxyBook & {
  loan_key?: string | number | null;
  user_key?: string | number | null;
  loan_user_key?: string | number | null;
  user_no?: string | null;
  loan_date?: string | number | null;
  rtn_date?: string | number | null;
  extend_cnt?: string | number | null;
  loan_status?: string | null;
  loan_status_desc?: string | null;
};

type DlsErrorReason =
  | "CONNECTION_FAILED"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "LOOKUP_FAILED";

type DlsErrorDetail = {
  service: "DLS";
  reason: DlsErrorReason;
  path: string;
  httpStatus?: number;
  proxyStatus?: string;
  timeout?: boolean;
  responseBody?: string;
};

const dlsErrorCodes: Record<DlsErrorReason, number> = {
  CONNECTION_FAILED: 5021,
  TIMEOUT: 5022,
  HTTP_ERROR: 5023,
  INVALID_RESPONSE: 5024,
  LOOKUP_FAILED: 5025
};

const dlsErrorMessages: Record<DlsErrorReason, string> = {
  CONNECTION_FAILED: "학교 도서관 프록시에 연결할 수 없습니다.",
  TIMEOUT: "학교 도서관 프록시 요청 시간이 초과되었습니다.",
  HTTP_ERROR: "학교 도서관 프록시가 오류 응답을 반환했습니다.",
  INVALID_RESPONSE: "학교 도서관 서버 응답이 올바르지 않습니다.",
  LOOKUP_FAILED: "학교 도서관 조회에 실패했습니다."
};

const buildDlsUrl = (path: string) => {
  const base = new URL(env.dls.baseUrl);
  const input = new URL(path, "http://book-on.local");
  const basePath = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  const inputPath = input.pathname.replace(/^\//, "");
  base.pathname = [basePath, inputPath].filter(Boolean).join("/");
  base.search = input.search;
  return base;
};

const toBodyPreview = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 500);

const toSafePath = (url: URL) => {
  const query = [...url.searchParams.keys()].map((key) => `${key}=...`).join("&");
  return `${url.pathname}${query ? `?${query}` : ""}`;
};

const createDlsError = (
  reason: DlsErrorReason,
  url: URL,
  options: {
    httpStatus?: number;
    proxyStatus?: string;
    timeout?: boolean;
    responseBody?: string;
    message?: string;
  } = {}
) => {
  const detail: DlsErrorDetail = {
    service: "DLS",
    reason,
    path: toSafePath(url),
    httpStatus: options.httpStatus,
    proxyStatus: options.proxyStatus,
    timeout: options.timeout,
    responseBody: options.responseBody ? toBodyPreview(options.responseBody) : undefined
  };

  console.error("[DLS_PROXY_ERROR]", JSON.stringify(detail));

  return new ApiError(
    502,
    dlsErrorCodes[reason],
    options.message || dlsErrorMessages[reason],
    detail
  );
};

const isTimeoutError = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

export const isDlsServiceError = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 502 &&
  typeof error.data === "object" &&
  error.data !== null &&
  (error.data as { service?: unknown }).service === "DLS";

const request = async <T>(path: string, init?: RequestInit) => {
  const url = buildDlsUrl(path);
  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        "user-agent": "Book-on/1.0",
        ...init?.headers
      },
      signal: AbortSignal.timeout(env.dls.timeoutMs)
    });
  } catch (error) {
    throw createDlsError(isTimeoutError(error) ? "TIMEOUT" : "CONNECTION_FAILED", url, {
      timeout: isTimeoutError(error)
    });
  }

  const responseBody = await response.text().catch(() => "");
  if (!response.ok) {
    throw createDlsError("HTTP_ERROR", url, {
      httpStatus: response.status,
      responseBody
    });
  }

  let body: DlsProxyEnvelope<T>;
  try {
    body = JSON.parse(responseBody) as DlsProxyEnvelope<T>;
  } catch {
    throw createDlsError("INVALID_RESPONSE", url, {
      httpStatus: response.status,
      responseBody
    });
  }

  const proxyStatus = typeof body.status === "string" ? body.status : undefined;
  const successStatus = body.status === "SUCCESS" || body.status === "WARNING";
  if (body.success === false || (body.status !== undefined && !successStatus)) {
    throw createDlsError("LOOKUP_FAILED", url, {
      httpStatus: response.status,
      proxyStatus,
      responseBody,
      message: body.message
    });
  }

  if (body.data === undefined || body.data === null) {
    throw createDlsError("INVALID_RESPONSE", url, {
      httpStatus: response.status,
      proxyStatus,
      responseBody
    });
  }

  return body.data;
};

const toText = (value: unknown) => (value === undefined || value === null ? "" : String(value));

const toNullableText = (value: unknown) => {
  const text = toText(value).trim();
  return text || null;
};

const toInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const json = (value: unknown) => JSON.stringify(value);

const getRegCode = (item: { reg_code?: unknown; reg_no?: unknown }) =>
  toText(item.reg_code || item.reg_no).trim();

const getStableNumericBookKey = (regCode: string) => {
  const prefix = (regCode.match(/^[A-Za-z]+/)?.[0] ?? "DLS").toUpperCase();
  const number = Number(regCode.match(/\d+$/)?.[0] ?? 0);
  const prefixHash = [...prefix].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100;
  return String((prefixHash + 1) * 1000000000 + number);
};

const callNoCategoryNames: Record<string, string> = {
  "0": "총류",
  "1": "철학",
  "2": "종교",
  "3": "사회과학",
  "4": "자연과학",
  "5": "기술과학",
  "6": "예술",
  "7": "언어",
  "8": "문학",
  "9": "역사"
};

const getCallNoCategory = (callNo: string) => {
  const code = callNo.trim().match(/^\d/)?.[0] ?? "";
  return {
    code: code || null,
    name: code ? callNoCategoryNames[code] ?? code : null
  };
};

const ensureDlsCategory = async (category: { code: string | null; name: string | null }) => {
  if (!category.code || !category.name) {
    return;
  }
  await pool.query(
    `
      INSERT INTO dls_categories (code, name, source, updated_at)
      VALUES (?, ?, 'REG_CODE', CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        updated_at = CURRENT_TIMESTAMP
    `,
    [category.code, category.name]
  );
};

const getCatalogCategory = async (regCode: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        call_no AS callNo,
        category_code AS categoryCode,
        category_name AS categoryName
      FROM dls_catalog_books
      WHERE reg_code = ?
      LIMIT 1
    `,
    [regCode]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    code: toNullableText(row.categoryCode),
    name: toNullableText(row.categoryName),
    callNo: toNullableText(row.callNo)
  };
};

const resolveBookCategory = async (book: DlsProxyBook, regCode: string) => {
  const dlsCallNo = toNullableText(book.call_no);
  const dlsCategory = getCallNoCategory(toText(book.call_no || book.class_no));
  if (dlsCategory.code || dlsCategory.name) {
    return {
      ...dlsCategory,
      callNo: dlsCallNo
    };
  }

  const catalog = await getCatalogCategory(regCode);
  if (catalog?.code || catalog?.name) {
    return {
      code: catalog.code,
      name: catalog.name,
      callNo: catalog.callNo
    };
  }
  return {
    ...dlsCategory,
    callNo: dlsCallNo
  };
};

const upsertCachedBook = async (book: DlsProxyBook) => {
  const regCode = getRegCode(book);
  if (!regCode) {
    return;
  }
  const category = await resolveBookCategory(book, regCode);
  await ensureDlsCategory(category);
  await pool.query(
    `
      INSERT INTO dls_books (
        reg_code, title, author, publisher, pub_year, isbn, call_no, class_no,
        category_code, category_name, cover_image_url, location_name, status,
        return_plan_date, holding_key, bib_key, raw_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(reg_code) DO UPDATE SET
        title = excluded.title,
        author = excluded.author,
        publisher = excluded.publisher,
        pub_year = excluded.pub_year,
        isbn = excluded.isbn,
        call_no = excluded.call_no,
        class_no = excluded.class_no,
        category_code = excluded.category_code,
        category_name = excluded.category_name,
        cover_image_url = COALESCE(excluded.cover_image_url, dls_books.cover_image_url),
        location_name = excluded.location_name,
        status = excluded.status,
        return_plan_date = excluded.return_plan_date,
        holding_key = excluded.holding_key,
        bib_key = excluded.bib_key,
        raw_json = excluded.raw_json,
        deleted_at = NULL,
        last_synced_at = CURRENT_TIMESTAMP
    `,
    [
      regCode,
      toText(book.title) || "(제목 없음)",
      toNullableText(book.aut_nm),
      toNullableText(book.publisher),
      toNullableText(book.pblcn_yr),
      toNullableText(book.ea_isbn),
      category.callNo || toNullableText(book.call_no),
      toNullableText(book.class_no),
      category.code,
      category.name,
      toNullableText(book.cover_img_path),
      toNullableText(book.location_desc || book.location || book.location_nm),
      toNullableText(book.status_desc || book.status),
      toNullableText(book.rtn_plan_date),
      toNullableText(book.holding_key),
      toNullableText(book.bib_key),
      json(book)
    ]
  );
};

const upsertCachedStudent = async (student: DlsProxyStudent) => {
  const userKey = toText(student.user_key).trim();
  if (!userKey) {
    return;
  }
  await pool.query(
    `
      INSERT INTO dls_users (
        user_key, user_no, name, user_class, user_class_name, school_name,
        user_status, loan_status, raw_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_key) DO UPDATE SET
        user_no = excluded.user_no,
        name = excluded.name,
        user_class = excluded.user_class,
        user_class_name = excluded.user_class_name,
        school_name = excluded.school_name,
        user_status = excluded.user_status,
        loan_status = excluded.loan_status,
        raw_json = excluded.raw_json,
        last_synced_at = CURRENT_TIMESTAMP
    `,
    [
      userKey,
      toNullableText(student.user_no),
      toText(student.name || student.user_nm) || "(이름 없음)",
      toNullableText(student.user_class),
      toNullableText(student.user_class_nm),
      toNullableText(student.school_nm),
      toNullableText(student.user_status),
      toNullableText(student.loan_status),
      json(student)
    ]
  );
};

const cacheBookList = async (data: DlsProxyBookList) => {
  await Promise.all((data.bookList ?? []).map(upsertCachedBook));
};

const hideStaleSearchBooks = async (
  queryText: string,
  categoryCode: string | undefined,
  data: DlsProxyBookList
) => {
  const returnedRegCodes = (data.bookList ?? []).map(getRegCode).filter(Boolean);
  const values: unknown[] = [`%${queryText}%`, `%${queryText}%`, `%${queryText}%`, `%${queryText}%`, `%${queryText}%`];
  const filters = [
    "deleted_at IS NULL",
    "(title LIKE ? OR author LIKE ? OR publisher LIKE ? OR reg_code LIKE ? OR category_name LIKE ?)"
  ];
  if (categoryCode) {
    filters.push("category_code = ?");
    values.push(categoryCode);
  }
  if (returnedRegCodes.length > 0) {
    filters.push(`reg_code NOT IN (${returnedRegCodes.map(() => "?").join(", ")})`);
    values.push(...returnedRegCodes);
  }

  await pool.query(
    `
      UPDATE dls_books
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE ${filters.join(" AND ")}
    `,
    values
  );
};

const hideMissingBookInfos = async (regNos: string, data: DlsProxyBookList) => {
  const requested = regNos.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0) {
    return;
  }
  const returned = new Set((data.bookList ?? []).map(getRegCode).filter(Boolean));
  const missing = requested.filter((regCode) => !returned.has(regCode));
  if (missing.length === 0) {
    return;
  }
  await pool.query(
    `
      UPDATE dls_books
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE reg_code IN (${missing.map(() => "?").join(", ")})
    `,
    missing
  );
};

const cacheSearchStudent = async (data: DlsProxyData) => {
  const students = Array.isArray(data.user_loan_info) ? data.user_loan_info as DlsProxyStudent[] : [];
  await Promise.all(students.map(upsertCachedStudent));
};

const cacheCurrentLoan = async (userKey: string, userNo: string, data: DlsProxyData) => {
  const loans = Array.isArray(data.user_loan_list) ? data.user_loan_list as DlsProxyLoan[] : [];
  await Promise.all(loans.map(async (loan) => {
    await upsertCachedBook(loan);
    const regCode = getRegCode(loan);
    const loanKey = toText(loan.loan_key).trim();
    if (!regCode || !loanKey) {
      return;
    }
    await pool.query(
      `
        INSERT OR IGNORE INTO dls_users (user_key, user_no, name, raw_json)
        VALUES (?, ?, '(알 수 없음)', '{}')
      `,
      [userKey, userNo]
    );
    await pool.query(
      `
        INSERT INTO dls_current_loans (
          loan_key, user_key, user_no, reg_code, title, author, publisher,
          loan_date, return_plan_date, extend_count, loan_status, loan_status_desc,
          raw_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(loan_key) DO UPDATE SET
          user_key = excluded.user_key,
          user_no = excluded.user_no,
          reg_code = excluded.reg_code,
          title = excluded.title,
          author = excluded.author,
          publisher = excluded.publisher,
          loan_date = excluded.loan_date,
          return_plan_date = excluded.return_plan_date,
          extend_count = excluded.extend_count,
          loan_status = excluded.loan_status,
          loan_status_desc = excluded.loan_status_desc,
          raw_json = excluded.raw_json,
          last_synced_at = CURRENT_TIMESTAMP
      `,
      [
        loanKey,
        userKey,
        userNo,
        regCode,
        toText(loan.title) || "(제목 없음)",
        toNullableText(loan.aut_nm),
        toNullableText(loan.publisher),
        toNullableText(loan.loan_date),
        toNullableText(loan.rtn_plan_date),
        toInteger(loan.extend_cnt),
        toNullableText(loan.loan_status),
        toNullableText(loan.loan_status_desc),
        json(loan)
      ]
    );
  }));
};

const cacheLoanHistory = async (userKey: string, data: DlsProxyData) => {
  const loans = Array.isArray(data.loan_hist_list) ? data.loan_hist_list as DlsProxyLoan[] : [];
  await Promise.all(loans.map(async (loan) => {
    await upsertCachedBook(loan);
    const regCode = getRegCode(loan);
    if (!regCode) {
      return;
    }
    await pool.query(
      "INSERT OR IGNORE INTO dls_users (user_key, name, raw_json) VALUES (?, '(알 수 없음)', '{}')",
      [userKey]
    );
    const historyKey = [
      userKey,
      toText(loan.loan_key),
      regCode,
      toText(loan.loan_date),
      toText(loan.rtn_date)
    ].join(":");
    await pool.query(
      `
        INSERT INTO dls_loan_histories (
          history_key, loan_key, user_key, reg_code, title, author, publisher,
          loan_date, return_date, return_plan_date, loan_status, raw_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(history_key) DO UPDATE SET
          loan_key = excluded.loan_key,
          title = excluded.title,
          author = excluded.author,
          publisher = excluded.publisher,
          loan_date = excluded.loan_date,
          return_date = excluded.return_date,
          return_plan_date = excluded.return_plan_date,
          loan_status = excluded.loan_status,
          raw_json = excluded.raw_json,
          last_synced_at = CURRENT_TIMESTAMP
      `,
      [
        historyKey,
        toNullableText(loan.loan_key),
        userKey,
        regCode,
        toText(loan.title) || "(제목 없음)",
        toNullableText(loan.aut_nm),
        toNullableText(loan.publisher),
        toNullableText(loan.loan_date),
        toNullableText(loan.rtn_date),
        toNullableText(loan.rtn_plan_date),
        toNullableText(loan.loan_status),
        json(loan)
      ]
    );
  }));
};

const parseRaw = <T>(value: unknown): T | null => {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const fallbackBookInfo = async (regNos: string): Promise<DlsProxyBookList> => {
  const requested = regNos.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  const placeholders = requested.map(() => "?").join(", ");
  const where = requested.length > 0
    ? `WHERE deleted_at IS NULL AND reg_code IN (${placeholders})`
    : "WHERE deleted_at IS NULL";
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT raw_json FROM dls_books ${where} ORDER BY last_synced_at DESC`,
    requested
  );
  const bookList = rows
    .map((row) => parseRaw<DlsProxyBook>(row.raw_json))
    .filter((book): book is DlsProxyBook => Boolean(book));
  if (bookList.length === 0) {
    throw new ApiError(502, 5025, "DLS 프록시를 사용할 수 없고 저장된 도서 정보도 없습니다.", { source: "DLS_CACHE" });
  }
  return {
    statusDescription: "OFFLINE_CACHE",
    count: bookList.length,
    bookList
  };
};

const fallbackSearchBook = async (queryText: string, categoryCode?: string): Promise<DlsProxyBookList> => {
  const like = `%${queryText}%`;
  const filters = ["(title LIKE ? OR author LIKE ? OR publisher LIKE ? OR reg_code LIKE ? OR category_name LIKE ?)"];
  const values: unknown[] = [like, like, like, like, like];
  if (categoryCode) {
    filters.push("category_code = ?");
    values.push(categoryCode);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT raw_json
      FROM dls_books
      WHERE deleted_at IS NULL AND ${filters.join(" AND ")}
      ORDER BY last_synced_at DESC
      LIMIT 100
    `,
    values
  );
  const bookList = rows
    .map((row) => parseRaw<DlsProxyBook>(row.raw_json))
    .filter((book): book is DlsProxyBook => Boolean(book));
  if (bookList.length === 0) {
    throw new ApiError(502, 5025, "DLS 프록시를 사용할 수 없고 저장된 검색 결과도 없습니다.", { source: "DLS_CACHE" });
  }
  return {
    statusDescription: "OFFLINE_CACHE",
    count: bookList.length,
    bookList
  };
};

const fallbackSearchStudent = async (name: string): Promise<DlsProxyData> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT raw_json
      FROM dls_users
      WHERE name LIKE ? OR user_no LIKE ? OR user_class LIKE ?
      ORDER BY last_synced_at DESC
      LIMIT 50
    `,
    [`%${name}%`, `%${name}%`, `%${name}%`]
  );
  const userLoanInfo = rows
    .map((row) => parseRaw<DlsProxyStudent>(row.raw_json))
    .filter((student): student is DlsProxyStudent => Boolean(student));
  if (userLoanInfo.length === 0) {
    throw new ApiError(502, 5025, "DLS 프록시를 사용할 수 없고 저장된 유저 정보도 없습니다.", { source: "DLS_CACHE" });
  }
  return {
    statusDescrition: "OFFLINE_CACHE",
    user_search_count: userLoanInfo.length,
    user_loan_info: userLoanInfo
  };
};

const fallbackCurrentLoan = async (userKey: string): Promise<DlsProxyData> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT raw_json FROM dls_current_loans WHERE user_key = ? ORDER BY return_plan_date ASC, loan_date DESC",
    [userKey]
  );
  const userLoanList = rows
    .map((row) => parseRaw<DlsProxyLoan>(row.raw_json))
    .filter((loan): loan is DlsProxyLoan => Boolean(loan));
  if (userLoanList.length === 0) {
    throw new ApiError(502, 5025, "DLS 프록시를 사용할 수 없고 저장된 현재 대출 정보도 없습니다.", { source: "DLS_CACHE" });
  }
  return {
    statusDescrition: "OFFLINE_CACHE",
    user_loan_list: userLoanList
  };
};

const fallbackLoanHistory = async (userKey: string): Promise<DlsProxyData> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT raw_json FROM dls_loan_histories WHERE user_key = ? ORDER BY loan_date DESC, return_date DESC",
    [userKey]
  );
  const loanHistList = rows
    .map((row) => parseRaw<DlsProxyLoan>(row.raw_json))
    .filter((loan): loan is DlsProxyLoan => Boolean(loan));
  if (loanHistList.length === 0) {
    throw new ApiError(502, 5025, "DLS 프록시를 사용할 수 없고 저장된 대출 기록도 없습니다.", { source: "DLS_CACHE" });
  }
  return {
    statusDescription: "OFFLINE_CACHE",
    loan_hist_list: loanHistList
  };
};

const withCacheFallback = async <T>(live: () => Promise<T>, fallback: () => Promise<T>) => {
  try {
    return await live();
  } catch (error) {
    if (isDlsServiceError(error)) {
      return fallback();
    }
    throw error;
  }
};

const normalizeDlsDate = (value: unknown) => {
  const text = toText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10).replaceAll("-", "");
  }
  if (/^\d{8}$/.test(text)) {
    return text;
  }
  return "";
};

const mapProxyBook = (book: DlsProxyBook): DlsBook => {
  const regNo = getRegCode(book);
  const holdingKey = toText(book.holding_key || book.bib_key || getStableNumericBookKey(regNo));
  const bibKey = toText(book.bib_key || book.holding_key || regNo);
  const locationName = toText(book.location_desc || book.location || book.location_nm);
  const classNo = toText(book.class_no);
  const category = getCallNoCategory(toText(book.call_no || book.class_no));

  return {
    bookKey: holdingKey,
    speciesKey: regNo || bibKey,
    provCode: env.dls.provCode,
    neisCode: env.dls.neisCode,
    title: toText(book.title),
    author: toText(book.aut_nm),
    publisher: toText(book.publisher),
    pubYear: toText(book.pblcn_yr),
    coverUrl: toText(book.cover_img_path),
    isbn: toText(book.ea_isbn),
    regNo,
    classNo,
    callNo: toText(book.call_no),
    locationName,
    regDate: normalizeDlsDate(book.reg_date || book.update_date),
    status: toText(book.status_desc || book.status),
    count: "1",
    categoryInfo: {
      lcode: category.code || undefined,
      ldesc: category.name || undefined
    },
    kdcInfo: {
      lcode: classNo.slice(0, 1),
      ldesc: classNo.slice(0, 1)
    }
  };
};

const toSearchResult = (data: DlsProxyBookList, page: number, size: number): DlsSearchResult => {
  const books = (data.bookList ?? []).map(mapProxyBook);
  const totalCount = Number(data.count ?? books.length);
  const start = (page - 1) * size;
  const bookList = books.slice(start, start + size);

  return {
    allTotalCount: totalCount,
    totalCount,
    totalPage: Math.max(1, Math.ceil(totalCount / size)),
    bookList
  };
};

export const searchDlsBooks = async (options: SearchOptions) => {
  const page = options.page ?? 1;
  const size = options.size ?? 20;
  const query = new URLSearchParams({ query: options.keyword || "" });
  if (options.searchType) {
    query.set("searchType", options.searchType);
  }
  if (options.categoryCode) {
    query.set("categoryCode", options.categoryCode);
  }
  if (options.kdcCode) {
    query.set("kdcCode", options.kdcCode);
  }
  if (options.sort) {
    query.set("sort", options.sort);
  }
  if (options.order) {
    query.set("order", options.order);
  }
  const data = await withCacheFallback(
    () => request<DlsProxyBookList>(`/searchBook?${query}`).then(async (liveData) => {
      await cacheBookList(liveData);
      await hideStaleSearchBooks(options.keyword || "", options.categoryCode, liveData);
      return liveData;
    }),
    () => fallbackSearchBook(options.keyword || "", options.categoryCode)
  );
  return toSearchResult(data, page, size);
};

export const getDlsReturnDate = () => request<DlsProxyData>("/returnDate");

export const searchDlsStudent = (name: string) => {
  const query = new URLSearchParams({ name });
  return withCacheFallback(
    () => request<DlsProxyData>(`/searchStudent?${query}`).then(async (data) => {
      await cacheSearchStudent(data);
      return data;
    }),
    () => fallbackSearchStudent(name)
  );
};

export const getDlsCurrentLoan = (userKey: string, userNo: string) => {
  const query = new URLSearchParams({ user_key: userKey, user_no: userNo });
  return withCacheFallback(
    () => request<DlsProxyData>(`/currentLoan?${query}`).then(async (data) => {
      await cacheCurrentLoan(userKey, userNo, data);
      return data;
    }),
    () => fallbackCurrentLoan(userKey)
  );
};

export const getDlsBookInfo = (regNos: string) => {
  const query = new URLSearchParams({ reg_nos: regNos });
  return withCacheFallback(
    () => request<DlsProxyBookList>(`/bookInfo?${query}`).then(async (data) => {
      await cacheBookList(data);
      await hideMissingBookInfos(regNos, data);
      return data;
    }),
    () => fallbackBookInfo(regNos)
  );
};

export const getDlsLoanHistory = (userKey: string, endDate?: string, startDate?: string) => {
  const query = new URLSearchParams({ user_key: userKey });
  if (endDate) {
    query.set("end_date", endDate);
  }
  if (startDate) {
    query.set("start_date", startDate);
  }
  return withCacheFallback(
    () => request<DlsProxyData>(`/loanHistory?${query}`).then(async (data) => {
      await cacheLoanHistory(userKey, data);
      return data;
    }),
    () => fallbackLoanHistory(userKey)
  );
};

export const executeDlsLoanReturn = (regNo: string, userKey: string) => {
  const query = new URLSearchParams({ reg_no: regNo, user_key: userKey });
  return request<DlsProxyData>(`/execution?${query}`).then(async (data) => {
    if ("loan_info" in data && data.loan_info && typeof data.loan_info === "object") {
      await cacheCurrentLoan(userKey, "", { user_loan_list: [data.loan_info] });
    }
    if ("rtn_info" in data && data.rtn_info && typeof data.rtn_info === "object") {
      await cacheLoanHistory(userKey, { loan_hist_list: [data.rtn_info] });
    }
    return data;
  });
};

export const searchDlsBookRaw = (queryText: string) => {
  const query = new URLSearchParams({ query: queryText });
  return withCacheFallback(
    () => request<DlsProxyBookList>(`/searchBook?${query}`).then(async (data) => {
      await cacheBookList(data);
      await hideStaleSearchBooks(queryText, undefined, data);
      return data;
    }),
    () => fallbackSearchBook(queryText)
  );
};

export const extendDlsLoan = (userKey: string, loanKey: string) => {
  const query = new URLSearchParams({ user_key: userKey, loan_key: loanKey });
  return request<DlsProxyData>(`/extendLoan?${query}`);
};

export const getDlsBookState = (
  book: Pick<DlsBook, "bookKey" | "provCode" | "neisCode"> & { regNo?: string }
) => {
  const query = new URLSearchParams({ reg_nos: book.regNo || book.bookKey });
  return request<DlsProxyBookList>(`/bookInfo?${query}`).then((data) => {
    const found = (data.bookList ?? [])[0];
    return {
      coverUrl: toText(found?.cover_img_path),
      status: toText(found?.status_desc || found?.status),
      locationName: toText(found?.location_desc || found?.location || found?.location_nm),
      returnPlanDate: toText(found?.rtn_plan_date)
    };
  });
};

export const getDlsBookDetail = (bookKey: string, speciesKey: string) => {
  const regNo = speciesKey || bookKey;
  const query = new URLSearchParams({ reg_nos: regNo });
  return request<DlsProxyBookList>(`/bookInfo?${query}`).then((data) => {
    const found = (data.bookList ?? [])[0];
    if (!found) {
      throw new ApiError(404, 4042, "도서를 찾을 수 없습니다.");
    }
    return mapProxyBook(found);
  });
};

export const getDlsPopularBooks = async () => {
  const result = await searchDlsBooks({
    keyword: env.dls.popularKeyword,
    page: 1,
    size: 50
  });
  return result.bookList;
};

export const getDlsCategories = async () => {
  return Object.entries(callNoCategoryNames).map(([code, name]) => ({
    lCategoryCode: code,
    lCategoryDesc: name
  }));
};

const parseDate = (book: DlsBook) => {
  if (book.regDate && /^\d{8}$/.test(book.regDate)) {
    return `${book.regDate.slice(0, 4)}-${book.regDate.slice(4, 6)}-${book.regDate.slice(6, 8)}`;
  }
  if (book.pubYear && /^\d{4}$/.test(book.pubYear)) {
    return `${book.pubYear}-01-01`;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
};

let dlsCategoryId: number | undefined;

const getLocalDlsCategoryId = async () => {
  if (dlsCategoryId !== undefined) {
    return dlsCategoryId;
  }
  const q = bookQueries.findDlsCategoryId();
  const [rows] = await pool.query<RowDataPacket[]>(q.sql, q.values);
  if (!rows[0]) {
    throw new ApiError(500, 5002, "도서 카테고리가 준비되지 않았습니다.");
  }
  dlsCategoryId = Number(rows[0].id);
  return dlsCategoryId;
};

export const syncDlsBooks = async (books: DlsBook[]) => {
  if (books.length === 0) {
    return;
  }
  const categoryId = await getLocalDlsCategoryId();
  await Promise.all(books.map((book) => {
    const bookId = Number(book.bookKey);
    if (!Number.isSafeInteger(bookId)) {
      throw new ApiError(502, 5021, "학교 도서 식별자가 올바르지 않습니다.");
    }
    const q = bookQueries.upsertBook(
      bookId,
      book.title,
      book.author || "",
      book.publisher || "",
      categoryId,
      `DLS:${book.speciesKey}:${book.regNo || book.bookKey}`,
      book.description || null,
      book.coverUrl || null,
      parseDate(book)
    );
    return pool.query(q.sql, q.values);
  }));
};

export const enrichDlsBooks = async (books: DlsBook[], concurrency = 5) => {
  const result: Array<{ book: DlsBook; state: DlsBookState | null }> = new Array(books.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, books.length) }, async () => {
    while (index < books.length) {
      const current = index++;
      const book = books[current];
      try {
        result[current] = { book, state: await getDlsBookState(book) };
      } catch {
        result[current] = { book, state: null };
      }
    }
  });
  await Promise.all(workers);
  await syncDlsBooks(result.map(({ book, state }) => ({
    ...book,
    coverUrl: state?.coverUrl || book.coverUrl,
    status: state?.status || book.status,
    locationName: state?.locationName || book.locationName
  })));
  return result;
};

export const serializeDlsBook = (book: DlsBook, state?: DlsBookState | null) => {
  const status = state?.status || book.status || "";
  const loanAvailable = ["대출가능", "비치도서", "01"].includes(status);
  return {
    bookId: Number(book.bookKey),
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    category: book.categoryInfo?.ldesc || book.kdcInfo?.sdesc || "학교도서관",
    libraryNumber: book.callNo || book.regNo || "",
    coverImageUrl: state?.coverUrl || book.coverUrl || null,
    totalQuantity: 1,
    availableQuantity: loanAvailable ? 1 : 0,
    loanAvailable,
    status: status || null,
    isbn: book.isbn || null,
    registeredAt: parseDate(book)
  };
};
