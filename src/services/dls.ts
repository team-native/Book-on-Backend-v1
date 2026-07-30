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
  const regNo = toText(book.reg_no);
  const holdingKey = toText(book.holding_key || book.bib_key || regNo);
  const bibKey = toText(book.bib_key || book.holding_key || regNo);
  const locationName = toText(book.location_desc || book.location || book.location_nm);
  const classNo = toText(book.class_no);

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
  const data = await request<DlsProxyBookList>(`/searchBook?${query}`);
  return toSearchResult(data, page, size);
};

export const getDlsReturnDate = () => request<DlsProxyData>("/returnDate");

export const searchDlsStudent = (name: string) => {
  const query = new URLSearchParams({ name });
  return request<DlsProxyData>(`/searchStudent?${query}`);
};

export const getDlsCurrentLoan = (userKey: string, userNo: string) => {
  const query = new URLSearchParams({ user_key: userKey, user_no: userNo });
  return request<DlsProxyData>(`/currentLoan?${query}`);
};

export const getDlsBookInfo = (regNos: string) => {
  const query = new URLSearchParams({ reg_nos: regNos });
  return request<DlsProxyBookList>(`/bookInfo?${query}`);
};

export const getDlsLoanHistory = (userKey: string, endDate?: string, startDate?: string) => {
  const query = new URLSearchParams({ user_key: userKey });
  if (endDate) {
    query.set("end_date", endDate);
  }
  if (startDate) {
    query.set("start_date", startDate);
  }
  return request<DlsProxyData>(`/loanHistory?${query}`);
};

export const executeDlsLoanReturn = (regNo: string, userKey: string) => {
  const query = new URLSearchParams({ reg_no: regNo, user_key: userKey });
  return request<DlsProxyData>(`/execution?${query}`);
};

export const searchDlsBookRaw = (queryText: string) => {
  const query = new URLSearchParams({ query: queryText });
  return request<DlsProxyBookList>(`/searchBook?${query}`);
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
  return [
    { lCategoryCode: "0", lCategoryDesc: "총류" },
    { lCategoryCode: "1", lCategoryDesc: "철학" },
    { lCategoryCode: "2", lCategoryDesc: "종교" },
    { lCategoryCode: "3", lCategoryDesc: "사회과학" },
    { lCategoryCode: "4", lCategoryDesc: "자연과학" },
    { lCategoryCode: "5", lCategoryDesc: "기술과학" },
    { lCategoryCode: "6", lCategoryDesc: "예술" },
    { lCategoryCode: "7", lCategoryDesc: "언어" },
    { lCategoryCode: "8", lCategoryDesc: "문학" },
    { lCategoryCode: "9", lCategoryDesc: "역사" }
  ];
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
