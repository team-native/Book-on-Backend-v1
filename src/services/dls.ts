import { env } from "../config/env";
import { bookQueries } from "../db/queries";
import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { ApiError } from "../lib/api";
import {
  DlsBook,
  DlsBookState,
  DlsCategory,
  DlsEnvelope,
  DlsSearchResult,
  SearchOptions,
} from "../types/dls.types";

export type { DlsBook, DlsBookState, DlsCategory };

const request = async <T>(path: string, init?: RequestInit) => {
  let response: globalThis.Response;
  try {
    response = await fetch(new URL(path, env.dls.baseUrl), {
      ...init,
      headers: {
        accept: "application/json",
        "user-agent": "Book-on/1.0",
        ...init?.headers
      },
      signal: AbortSignal.timeout(env.dls.timeoutMs)
    });
  } catch {
    throw new ApiError(502, 5021, "학교 도서관 서버에 연결할 수 없습니다.");
  }

  if (!response.ok) {
    throw new ApiError(502, 5021, "학교 도서관 서버 응답이 올바르지 않습니다.");
  }

  const body = (await response.json()) as DlsEnvelope<T>;
  if (body.status !== "OK") {
    throw new ApiError(502, 5021, body.message || "학교 도서관 조회에 실패했습니다.");
  }
  return body.data;
};

export const searchDlsBooks = (options: SearchOptions) => {
  const payload = {
    searchKeyword: options.keyword,
    searchType: options.searchType,
    categoryCode: options.categoryCode,
    kdcCode: options.kdcCode,
    page: options.page ?? 1,
    display: options.size ?? 20,
    sort: options.sort ?? "SCORE",
    order: options.order ?? "DESC",
    neisCode: [env.dls.neisCode],
    provCode: env.dls.provCode,
    schoolName: env.dls.schoolName,
    coverYn: "N",
    facet: "Y"
  };

  return request<DlsSearchResult>("/alpasq/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
};

export const getDlsBookState = (book: Pick<DlsBook, "bookKey" | "provCode" | "neisCode">) => {
  const query = new URLSearchParams({
    bookKey: book.bookKey,
    provCode: book.provCode || env.dls.provCode,
    neisCode: book.neisCode || env.dls.neisCode
  });
  return request<DlsBookState>(`/alpasq/api/search/book/state?${query}`);
};

export const getDlsBookDetail = (bookKey: string, speciesKey: string) => {
  const query = new URLSearchParams({
    bookKey,
    speciesKey,
    provCode: env.dls.provCode,
    neisCode: env.dls.neisCode
  });
  return request<DlsBook>(`/alpasq/api/detail/info?${query}`);
};

export const getDlsPopularBooks = () => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(new Date())
    .replaceAll("-", "");
  const query = new URLSearchParams({
    provCode: env.dls.provCode,
    neisCode: env.dls.neisCode,
    searchDate: date
  });
  return request<DlsBook[]>(`/dls/api/school/popular?${query}`);
};

export const getDlsCategories = async () => {
  const query = new URLSearchParams({ type: "B" });
  const data = await request<{ categoryList: DlsCategory[] }>(`/alpasq/api/category/list?${query}`);
  return data.categoryList;
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
  const loanAvailable = status === "대출가능" || status === "비치도서";
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
