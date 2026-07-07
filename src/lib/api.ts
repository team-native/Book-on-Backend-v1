import { NextFunction, Request, RequestHandler, Response } from "express";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: number,
    message: string,
    public readonly data: unknown = null
  ) {
    super(message);
  }
}

export const sendSuccess = (res: Response, status: number, message: string, data: unknown) => {
  res.status(status).json({ errorCode: 0, message, data });
};

export const asyncHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const parseId = (value: string, label: string): number => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 4001, `${label}가 올바르지 않습니다.`);
  }
  return id;
};

export const parsePositiveInteger = (value: unknown, fallback: number, maximum?: number) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    throw new ApiError(400, 4001, "요청 값이 올바르지 않습니다.");
  }
  return parsed;
};

export const pagination = (page: number, size: number, totalCount: number) => {
  const totalPages = Math.ceil(totalCount / size);
  return {
    page,
    size,
    totalCount,
    totalPages,
    hasNext: page < totalPages
  };
};
