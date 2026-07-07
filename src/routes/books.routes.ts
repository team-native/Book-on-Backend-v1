import { Router } from "express";
import {
  addFavorite,
  removeFavorite,
} from "../controllers/books.controller";
import {
  getSchoolBook,
  getSchoolRecommendations,
  listSchoolBooks,
  listSchoolCategories,
  listSchoolNewBooks,
  searchSchoolBooks
} from "../controllers/library-books.controller";
import { asyncHandler } from "../lib/api";
import { optionalAuth, requireAuth } from "../middleware/auth";

export const booksRouter = Router();

booksRouter.get("/search", asyncHandler(searchSchoolBooks));
booksRouter.get("/categories", asyncHandler(listSchoolCategories));
booksRouter.get("/new", asyncHandler(listSchoolNewBooks));
booksRouter.get("/recommendations/today", asyncHandler(getSchoolRecommendations));
booksRouter.get("/:bookId", optionalAuth, asyncHandler(getSchoolBook));
booksRouter.post("/:bookId/favorite", requireAuth, asyncHandler(addFavorite));
booksRouter.delete("/:bookId/favorite", requireAuth, asyncHandler(removeFavorite));
booksRouter.get("/", asyncHandler(listSchoolBooks));
