import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { ApiError } from "./lib/api";
import { authRouter } from "./routes/auth.routes";
import { booksRouter } from "./routes/books.routes";
import { dlsAdminRouter } from "./routes/dls-admin.routes";
import { loansRouter } from "./routes/loans.routes";
import { meRouter } from "./routes/me.routes";
import { publicRouter } from "./routes/public.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/life", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/books", booksRouter);
app.use("/admin/dls", dlsAdminRouter);
app.use("/loans", loansRouter);
app.use("/me", meRouter);
app.use(publicRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ errorCode: 4040, message: "요청한 API를 찾을 수 없습니다.", data: null });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      errorCode: err.errorCode,
      message: err.message,
      data: err.data
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      errorCode: 4000,
      message: "JSON 형식이 올바르지 않습니다.",
      data: null
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    errorCode: 5000,
    message: "서버 내부 오류가 발생했습니다.",
    data: null
  });
});
