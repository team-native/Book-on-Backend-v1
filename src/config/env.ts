import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

const getRequiredEnv = (key: string) => {
  const value = (process.env[key] ?? "").trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: getRequiredEnv("JWT_SECRET"),
  accessTokenExpiresIn: Number(process.env.ACCESS_TOKEN_EXPIRES_IN ?? 3600),
  refreshTokenExpiresIn: Number(process.env.REFRESH_TOKEN_EXPIRES_IN ?? 2592000),
  loanDays: Math.max(1, parseInt(process.env.LOAN_DAYS ?? "14", 10) || 14),
  extensionDays: Math.max(1, parseInt(process.env.EXTENSION_DAYS ?? "7", 10) || 7),
  sqlite: {
    path: process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "book-on.sqlite")
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM
  },
  read365: {
    baseUrl: process.env.READ365_BASE_URL ?? "https://read365.edunet.net",
    timeoutMs: Number(process.env.READ365_TIMEOUT_MS ?? 15000)
  },
  dls: {
    baseUrl: process.env.DLS_PROXY_BASE_URL ?? process.env.DLS_BASE_URL ?? "http://localhost:3001",
    provCode: process.env.DLS_PROV_CODE ?? "F10",
    neisCode: process.env.DLS_NEIS_CODE ?? "F100000120",
    schoolName: process.env.DLS_SCHOOL_NAME ?? "",
    timeoutMs: Number(process.env.DLS_TIMEOUT_MS ?? 30000)
  }
};
