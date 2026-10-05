import { Request, Response } from "express";
import { mapCanonicalDlsBooks } from "../services/library-book-mapper";
import { bookQueries } from "../db/queries";
import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { ApiError, parseId, pagination, parsePositiveInteger, sendSuccess } from "../lib/api";
import {
  DlsBook,
  getCachedDlsBookDetail,
  getDlsCategories,
  getDlsPopularBooks,
  getCatalogBooks,
  searchDlsBooks,
  serializeDlsBook
} from "../services/dls";

const categoryAliases: Record<string, string> = {
  NOVEL: "소설",
  SCIENCE: "과학/기술",
  HISTORY: "역사/문화",
  IT: "컴퓨터",
  ART: "예술/대중문화",
  SOCIETY: "사회과학"
};

const resolveCategory = async (value: string) => {
  const categories = await getDlsCategories();
  const normalized = categoryAliases[value.toUpperCase()] ?? value;
  const category = categories.find(
    (item) => item.lCategoryCode === normalized || item.lCategoryDesc === normalized
  );
  if (!category) {
    throw new ApiError(400, 4001, "도서 카테고리가 올바르지 않습니다.");
  }
  return category;
};


let recentCache: { expiresAt: number; books: DlsBook[] } | undefined;

const mergeCatalogBooks = async (liveBooks: DlsBook[]) => {
  const catalogBooks = await getCatalogBooks();
  const merged = new Map<string, DlsBook>();
  [...liveBooks, ...catalogBooks].forEach((book) => {
    const key = book.regNo || book.speciesKey || book.bookKey;
    if (!merged.has(key)) {
      merged.set(key, book);
    }
  });
  return [...merged.values()];
};

const loadRecentBooks = async () => {
  const roots = Array.from({ length: 10 }, (_, index) => `${index}00`);
  const results = await Promise.all(roots.map((kdcCode) =>
    searchDlsBooks({
      kdcCode,
      page: 1,
      size: 50,
      sort: "RECENT",
      order: "DESC"
    }).catch(() => ({ bookList: [] as DlsBook[] }))
  ));
  const unique = new Map<string, DlsBook>();
  results.flatMap((result) => result.bookList).forEach((book) => unique.set(book.bookKey, book));
  const liveBooks = [...unique.values()].sort((a, b) => {
    const aDate = a.regDate || a.pubYear || "";
    const bDate = b.regDate || b.pubYear || "";
    return bDate.localeCompare(aDate);
  });
  const books = await mergeCatalogBooks(liveBooks);
  recentCache = { expiresAt: Date.now() + 60000, books };
  return books;
};

let recentRequest: Promise<DlsBook[]> | undefined;
const recentMappingRequests = new WeakMap<DlsBook[], ReturnType<typeof mapCanonicalDlsBooks>>();

const getRecentBooks = async () => {
  if (recentCache && recentCache.expiresAt > Date.now()) {
    return recentCache.books;
  }
  if (recentRequest) {
    return recentRequest;
  }
  const request = loadRecentBooks();
  recentRequest = request;
  try {
    return await request;
  } finally {
    if (recentRequest === request) {
      recentRequest = undefined;
    }
  }
};

// 동시 요청만 공유하고 다음 요청에서는 최신 대출 상태를 다시 조회한다.
const mapRecentBooks = async (books: DlsBook[]) => {
  const pending = recentMappingRequests.get(books);
  if (pending) {
    return pending;
  }
  const request = mapCanonicalDlsBooks(books);
  recentMappingRequests.set(books, request);
  try {
    return await request;
  } finally {
    if (recentMappingRequests.get(books) === request) {
      recentMappingRequests.delete(books);
    }
  }
};

export const searchSchoolBooks = async (req: Request, res: Response) => {
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";
  const libraryNumber =
    typeof req.query.libraryNumber === "string" ? req.query.libraryNumber.trim() : "";
  if (!keyword && !libraryNumber) {
    throw new ApiError(
      422,
      4223,
      "책 제목 또는 도서관 번호 중 하나 이상을 입력해 주세요."
    );
  }

  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);
  const result = await searchDlsBooks({
    keyword: keyword || libraryNumber,
    page,
    size
  });
  let items = await mapCanonicalDlsBooks(result.bookList);
  if (libraryNumber) {
    const normalized = libraryNumber.replaceAll(" ", "").toLowerCase();
    items = items.filter((book) =>
      book.libraryNumber.replaceAll(" ", "").toLowerCase().includes(normalized)
    );
  }

  sendSuccess(res, 200, "도서 검색 성공", {
    items,
    pagination: pagination(page, size, libraryNumber ? items.length : result.allTotalCount)
  });
};

export const listSchoolBooks = async (req: Request, res: Response) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);
  const sort = typeof req.query.sort === "string" ? req.query.sort.toUpperCase() : "POPULAR";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  if (!['POPULAR', 'NEW'].includes(sort)) {
    throw new ApiError(400, 4001, "정렬 값이 올바르지 않습니다.");
  }

  if (category) {
    const resolved = await resolveCategory(category);
    const result = await searchDlsBooks({
      categoryCode: resolved.lCategoryCode,
      page,
      size,
      sort: sort === "NEW" ? "RECENT" : "SCORE",
      order: "DESC"
    });
    const categoryItems = await mapCanonicalDlsBooks(result.bookList);
    sendSuccess(res, 200, "도서 목록 조회 성공", {
      items: categoryItems,
      pagination: pagination(page, size, result.allTotalCount)
    });
    return;
  }

  const start = (page - 1) * size;
  let books: DlsBook[];
  if (sort === "NEW") {
    books = await getRecentBooks();
  } else {
    // The cached popular result is already ordered. Avoid loading and merging
    // the entire catalog when it can fill the requested page by itself.
    const popularBooks = await getDlsPopularBooks();
    books = popularBooks.length >= start + size
      ? popularBooks
      : await mergeCatalogBooks(popularBooks);
  }

  // Apply pagination before enrichment/serialization. The old flow processed
  // every cached/catalog book and sliced the result only at the end.
  const items = await mapCanonicalDlsBooks(books.slice(start, start + size));
  sendSuccess(res, 200, "도서 목록 조회 성공", {
    items,
    pagination: pagination(page, size, books.length)
  });
};

export const getSchoolBook = async (req: Request, res: Response) => {
  const bookId = parseId(req.params.bookId, "도서 ID");

  const q1 = bookQueries.findDlsBookLibraryNumber(bookId);
  const [rows] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);
  const speciesKey = String(rows[0]?.libraryNumber ?? "").split(":")[1];
  if (!speciesKey) {
    throw new ApiError(404, 4042, "도서를 찾을 수 없습니다.");
  }

  // Detail data is served from the crawler/DLS persistent cache. Do not call
  // DLS here: a dead Cloudflare tunnel must not turn a cached book into 5023.
  const book = await getCachedDlsBookDetail(speciesKey);

  const q2 = bookQueries.findUserFavorite(req.userId!, bookId);
  const [favorites] = req.userId
    ? await pool.query<RowDataPacket[]>(q2.sql, q2.values)
    : [[] as RowDataPacket[], []];

  sendSuccess(res, 200, "도서 상세 조회 성공", {
    ...serializeDlsBook({ ...book, bookKey: String(bookId) }, {
      coverUrl: book.coverUrl,
      status: book.status || "",
      locationName: book.locationName || "",
      returnPlanDate: ""
    }),
    description: book.description || null,
    favorite: favorites.length > 0,
    locationName: book.locationName || null,
    returnPlanDate: null
  });
};

export const listSchoolCategories = async (_req: Request, res: Response) => {
  const categories = await getDlsCategories();
  sendSuccess(res, 200, "도서 카테고리 목록 조회 성공", {
    items: categories.map((category, index) => ({
      categoryId: index + 1,
      code: category.lCategoryCode,
      name: category.lCategoryDesc,
      bookCount: 0
    }))
  });
};

export const listSchoolNewBooks = async (req: Request, res: Response) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const size = parsePositiveInteger(req.query.size, 20, 100);
  const books = await getRecentBooks();
  const items = await mapRecentBooks(books);
  const start = (page - 1) * size;
  sendSuccess(res, 200, "신간 도서 목록 조회 성공", {
    items: items.slice(start, start + size),
    pagination: pagination(page, size, items.length)
  });
};

export const getSchoolRecommendations = async (_req: Request, res: Response) => {
  const items = await mapCanonicalDlsBooks(await getDlsPopularBooks(), { requireCover: true });
  const recommendations = items.slice(0, 5);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  sendSuccess(res, 200, "오늘의 책 추천 조회 성공", {
    recommendedAt: date,
    items: recommendations.map((book) => ({
      ...book,
      reason: "학교 도서관의 실제 대출 통계를 기반으로 추천되었습니다."
    }))
  });
};
