import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { ApiError } from "./api";

type AccessTokenPayload = {
  sub: number;
  type: "access";
  iat: number;
  exp: number;
};

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

const signature = (value: string) =>
  createHmac("sha256", env.jwtSecret).update(value).digest("base64url");

export const createAccessToken = (userId: number) => {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: userId,
    type: "access",
    iat: now,
    exp: now + env.accessTokenExpiresIn
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signature(unsigned)}`;
};

export const verifyAccessToken = (token: string) => {
  const [header, payload, receivedSignature] = token.split(".");
  if (!header || !payload || !receivedSignature) {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }

  const expectedSignature = signature(`${header}.${payload}`);
  const actualBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }

  let decoded: AccessTokenPayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }

  if (decoded.type !== "access" || !Number.isInteger(decoded.sub) || decoded.exp <= Date.now() / 1000) {
    throw new ApiError(401, 4010, "인증이 필요합니다.");
  }
  return decoded;
};

export const createRefreshToken = () => randomBytes(48).toString("base64url");

export const hashToken = (token: string) =>
  createHmac("sha256", env.jwtSecret).update(token).digest("hex");
