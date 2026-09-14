import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeBookRecommendationStore, recommendBooks } from "../src/services/book-recommendation";

const metadata = JSON.parse(fs.readFileSync("school_book_metadata.json", "utf8"));
const source = metadata.books[0].book;
initializeBookRecommendationStore();

const result = recommendBooks([{
  isbn: source.isbn,
  title: source.title,
  author: source.author,
  publisher: source.publisher,
}], 5);

assert.equal(result.gemini_calls_per_recommendation, 0);
assert.equal(result.user_embedding_match_count, 1);
assert.equal(result.recommended_books.length, 5);
assert.ok(result.recommended_books.every((book) => book.title !== source.title));
assert.ok(result.recommended_books.every((book) => typeof book.score === "number"));
assert.deepEqual(recommendBooks([], 5).recommended_books, []);
console.log("recommendation integration checks passed");
