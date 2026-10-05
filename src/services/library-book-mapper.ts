import { pool } from "../db/pool";
import { RowDataPacket } from "../db/types";
import { DlsBook, enrichDlsBooks, serializeDlsBook } from "./dls";

export const mapCanonicalDlsBooks = async (books: DlsBook[], options: { requireCover?: boolean } = {}) => {
  const enriched = await enrichDlsBooks(books);
  if (enriched.length === 0) {
    return [];
  }

  // /books/:bookId resolves through the local books table. Return only rows
  // with that mapping and use its canonical id in every list response.
  const libraryNumbers = enriched.map(({ book }) =>
    `DLS:${book.speciesKey}:${book.regNo || book.bookKey}`
  );
  const placeholders = libraryNumbers.map(() => "?").join(", ");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, library_number AS libraryNumber FROM books WHERE library_number IN (${placeholders})`,
    libraryNumbers
  );
  const ids = new Map(rows.map((row) => [String(row.libraryNumber), Number(row.id)]));

  return enriched
    .map(({ book, state }) => {
      const libraryNumber = `DLS:${book.speciesKey}:${book.regNo || book.bookKey}`;
      const id = ids.get(libraryNumber);
      if (id === undefined) {
        return null;
      }
      const serialized = serializeDlsBook({ ...book, bookKey: String(id) }, state);
      if (options.requireCover && !serialized.coverImageUrl?.trim()) {
        return null;
      }
      return serialized;
    })
    .filter((book): book is NonNullable<typeof book> => book !== null);
};
