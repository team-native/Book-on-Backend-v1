import fs from "node:fs";
import path from "node:path";
import { ApiError } from "../lib/api";

type StoredBook = {
  title?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  category_name?: string;
  class_no?: string;
  [key: string]: unknown;
};

type MetadataRecord = { embedding_index: number; book: StoredBook };

export type RecommendationBook = {
  title?: unknown;
  author?: unknown;
  publisher?: unknown;
  isbn?: unknown;
  category_name?: unknown;
  class_no?: unknown;
};

type Store = {
  books: MetadataRecord[];
  vectors: Float32Array;
  rows: number;
  dimensions: number;
  isbnIndex: Map<string, number[]>;
  identityIndex: Map<string, number[]>;
  embeddingPath: string;
  metadataPath: string;
};

let store: Store | undefined;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const normalizeText = (value: unknown) => text(value).toLocaleLowerCase().replace(/\s+/g, " ");
const normalizeTitle = (value: unknown) => normalizeText(value).replace(/[\s\W_]+/gu, "");
const normalizeIsbn = (value: unknown) => text(value).replace(/[^0-9x]/gi, "").toLowerCase();
const identity = (book: RecommendationBook | StoredBook) =>
  `${normalizeTitle(book.title)}|${normalizeText(book.author)}|${normalizeText(book.publisher)}`;

const readNpy = (filePath: string) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer[0] !== 0x93 || buffer.toString("ascii", 1, 6) !== "NUMPY") {
    throw new Error(`Invalid NumPy file header: ${filePath}`);
  }
  const major = buffer[6];
  const headerLength = major === 1 ? buffer.readUInt16LE(8) : buffer.readUInt32LE(8);
  const headerStart = major === 1 ? 10 : 12;
  const header = buffer.toString("ascii", headerStart, headerStart + headerLength);
  if (!/'descr'\s*:\s*['"]<f4['"]/.test(header) || !/'fortran_order'\s*:\s*False/.test(header)) {
    throw new Error("Embedding file must be a little-endian, C-order float32 NumPy array");
  }
  const shapeMatch = header.match(/'shape'\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*,?\s*\)/);
  if (!shapeMatch) throw new Error("Embedding file shape could not be read");
  const rows = Number(shapeMatch[1]);
  const dimensions = Number(shapeMatch[2]);
  const dataOffset = headerStart + headerLength;
  const elementCount = rows * dimensions;
  if (dataOffset % 4 !== 0 || buffer.byteLength < dataOffset + elementCount * 4) {
    throw new Error("Embedding file is truncated or has an invalid data offset");
  }
  return { buffer, rows, dimensions, vectors: new Float32Array(buffer.buffer, buffer.byteOffset + dataOffset, elementCount) };
};

const addIndex = (index: Map<string, number[]>, key: string, row: number) => {
  if (!key) return;
  const rows = index.get(key);
  if (rows) rows.push(row); else index.set(key, [row]);
};

export const initializeBookRecommendationStore = () => {
  const defaultEmbeddingPath = path.join(process.cwd(), "school_book_embeddings.npy");
  const defaultMetadataPath = path.join(process.cwd(), "school_book_metadata.json");
  const bundledEmbeddingPath = path.join(process.cwd(), "school_book_embeddings", "school_book_embeddings.npy");
  const bundledMetadataPath = path.join(process.cwd(), "school_book_embeddings", "school_book_metadata.json");
  const embeddingPath = path.resolve(process.env.SCHOOL_BOOK_EMBEDDINGS_PATH ?? (fs.existsSync(defaultEmbeddingPath) ? defaultEmbeddingPath : bundledEmbeddingPath));
  const metadataPath = path.resolve(process.env.SCHOOL_BOOK_METADATA_PATH ?? (fs.existsSync(defaultMetadataPath) ? defaultMetadataPath : bundledMetadataPath));
  if (!fs.existsSync(embeddingPath) || !fs.existsSync(metadataPath)) {
    throw new Error(`School embedding assets are required: ${embeddingPath} and ${metadataPath}`);
  }
  let metadata: { books?: MetadataRecord[]; embedding_shape?: number[]; embedding_dtype?: string; source_table?: string };
  try { metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")); }
  catch (error) { throw new Error(`School embedding metadata could not be read: ${String(error)}`); }
  const npy = readNpy(embeddingPath);
  const books = metadata.books;
  if (!Array.isArray(books) || books.length !== npy.rows || metadata.embedding_shape?.[0] !== npy.rows || metadata.embedding_shape?.[1] !== npy.dimensions || metadata.embedding_dtype !== "float32") {
    throw new Error(`School embedding assets are mismatched: metadata books=${books?.length ?? 0}, metadata shape=${JSON.stringify(metadata.embedding_shape)}, npy shape=[${npy.rows},${npy.dimensions}]`);
  }
  const isbnIndex = new Map<string, number[]>();
  const identityIndex = new Map<string, number[]>();
  for (let row = 0; row < books.length; row += 1) {
    const record = books[row];
    if (!record || !Number.isInteger(record.embedding_index) || record.embedding_index !== row || !record.book) throw new Error(`Invalid embedding_index at metadata row ${row}`);
    addIndex(isbnIndex, normalizeIsbn(record.book.isbn), row);
    addIndex(identityIndex, identity(record.book), row);
  }
  store = { books, vectors: npy.vectors, rows: npy.rows, dimensions: npy.dimensions, isbnIndex, identityIndex, embeddingPath, metadataPath };
  console.log(`Loaded school book embeddings: ${npy.rows} books (${npy.dimensions} dimensions)`);
  return store;
};

export const getBookRecommendationStore = () => store;

const findMatches = (book: RecommendationBook, current: Store) => {
  const isbn = normalizeIsbn(book.isbn);
  return isbn ? (current.isbnIndex.get(isbn) ?? []) : (current.identityIndex.get(identity(book)) ?? []);
};

export const recommendBooks = (rawBooks: RecommendationBook[], topK: number) => {
  const current = store;
  if (!current) throw new ApiError(503, 5031, "추천 임베딩이 아직 로드되지 않았습니다.");
  const books = rawBooks.filter((book) => text(book.title) || text(book.isbn));
  if (!books.length) return { recommended_books: [], message: "사용자 책 목록이 비어 있거나 책 정보가 올바르지 않습니다." };
  const matched = new Set<number>();
  for (const book of books) for (const row of findMatches(book, current)) matched.add(row);
  if (!matched.size) return { recommended_books: [], message: "사용자 책을 학교 도서 임베딩에서 찾지 못했습니다." };

  const preference = new Float32Array(current.dimensions);
  for (const row of matched) for (let col = 0; col < current.dimensions; col += 1) preference[col] += current.vectors[row * current.dimensions + col];
  for (let col = 0; col < current.dimensions; col += 1) preference[col] /= matched.size;
  let preferenceNorm = 0;
  for (const value of preference) preferenceNorm += value * value;
  preferenceNorm = Math.sqrt(preferenceNorm);
  const readKeys = new Set(books.map((book) => identity(book)));
  const readIsbns = new Set(books.map((book) => normalizeIsbn(book.isbn)).filter(Boolean));
  const recommendations: Array<Record<string, unknown>> = [];
  for (let row = 0; row < current.rows; row += 1) {
    const candidate = current.books[row].book;
    const isbn = normalizeIsbn(candidate.isbn);
    if (matched.has(row) || (isbn && readIsbns.has(isbn)) || readKeys.has(identity(candidate))) continue;
    let dot = 0; let norm = 0;
    for (let col = 0; col < current.dimensions; col += 1) { const value = current.vectors[row * current.dimensions + col]; dot += value * preference[col]; norm += value * value; }
    const score = preferenceNorm && norm ? dot / (preferenceNorm * Math.sqrt(norm)) : 0;
    recommendations.push({ title: text(candidate.title), author: text(candidate.author), publisher: text(candidate.publisher), isbn: text(candidate.isbn), category_name: text(candidate.category_name), class_no: text(candidate.class_no), score: Number(score.toFixed(4)) });
  }
  recommendations.sort((a, b) => Number(b.score) - Number(a.score));
  return { recommended_books: recommendations.slice(0, topK), user_book_count: books.length, user_embedding_match_count: matched.size, gemini_calls_per_recommendation: 0 };
};
