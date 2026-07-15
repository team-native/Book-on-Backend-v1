import { Request, Response } from "express";
import { ApiError, sendSuccess } from "../lib/api";
import { getRead365Marathon, getRead365MyInfo } from "../services/read365-marathon";

export const getMarathon = async (req: Request, res: Response) => {
  if (typeof req.userId !== "number") {
    throw new ApiError(401, 4010, "로그인이 필요합니다.");
  }

  const data = await getRead365Marathon(req.userId);
  sendSuccess(res, 200, "read365 마라톤 정보를 조회했습니다.", data);
};

export const getRead365MyInfoHandler = async (req: Request, res: Response) => {
  if (typeof req.userId !== "number") {
    throw new ApiError(401, 4010, "로그인이 필요합니다.");
  }

  const data = await getRead365MyInfo(req.userId);
  sendSuccess(res, 200, "read365 내 정보를 조회했습니다.", data);
};
