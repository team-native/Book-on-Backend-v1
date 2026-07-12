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
  adminApiKey: process.env.ADMIN_API_KEY,
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
  dls: {
    baseUrl: process.env.DLS_BASE_URL ?? "https://read365.edunet.net",
    provCode: process.env.DLS_PROV_CODE ?? "F10",
    neisCode: process.env.DLS_NEIS_CODE ?? "F100000120",
    schoolName: process.env.DLS_SCHOOL_NAME ?? "광주소프트웨어마이스터고등학교",
    timeoutMs: Number(process.env.DLS_TIMEOUT_MS ?? 30000)
  },
  dlsAdmin: {
    baseUrl: process.env.DLS_ADMIN_BASE_URL ?? "https://dls.edunet.net",
    proxyBaseUrl: process.env.DLS_ADMIN_PROXY_BASE_URL ?? "http://127.0.0.1:8080",
    loginPagePath: process.env.DLS_ADMIN_LOGIN_PAGE_PATH ?? "",
    loginPath: process.env.DLS_ADMIN_LOGIN_PATH ?? "",
    loginMethod: (process.env.DLS_ADMIN_LOGIN_METHOD ?? "POST").toUpperCase(),
    loginContentType: process.env.DLS_ADMIN_LOGIN_CONTENT_TYPE ?? "form",
    username: process.env.DLS_ADMIN_USERNAME,
    password: process.env.DLS_ADMIN_PASSWORD,
    usernameField: process.env.DLS_ADMIN_USERNAME_FIELD ?? "username",
    passwordField: process.env.DLS_ADMIN_PASSWORD_FIELD ?? "password",
    userSearchPath: process.env.DLS_ADMIN_USER_SEARCH_PATH ?? "",
    userDetailPath: process.env.DLS_ADMIN_USER_DETAIL_PATH ?? "",
    loanCountPath: process.env.DLS_ADMIN_LOAN_COUNT_PATH ?? "",
    loanHistoryPath: process.env.DLS_ADMIN_LOAN_HISTORY_PATH ?? "",
    bookDetailPath: process.env.DLS_ADMIN_BOOK_DETAIL_PATH ?? "",
    userIdParam: process.env.DLS_ADMIN_USER_ID_PARAM ?? "userId",
    bookIdParam: process.env.DLS_ADMIN_BOOK_ID_PARAM ?? "bookId",
    origin: process.env.DLS_ADMIN_ORIGIN,
    referer: process.env.DLS_ADMIN_REFERER,
    csrfHeader: process.env.DLS_ADMIN_CSRF_HEADER,
    csrfCookieName: process.env.DLS_ADMIN_CSRF_COOKIE_NAME,
    sessionTtlMs: Number(process.env.DLS_ADMIN_SESSION_TTL_MS ?? 1800000),
    timeoutMs: Number(process.env.DLS_ADMIN_TIMEOUT_MS ?? 10000)
  }
};
