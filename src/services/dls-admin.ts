import { env } from "../config/env";
import { ApiError } from "../lib/api";

type Cookie = {
  value: string;
  expiresAt?: number;
};

type Query = Record<string, string | string[] | undefined>;
type Primitive = string | number | boolean | null | undefined;
type FormBody = Record<string, Primitive>;
type DlsRawResponse = {
  status?: string;
  statusDescription?: string;
  statusDescrition?: string;
  message?: string;
  [key: string]: unknown;
};

const cookies = new Map<string, Cookie>();
let sessionExpiresAt = 0;
let loginPromise: Promise<void> | undefined;

const splitSetCookie = (value: string) => value.split(/,(?=\s*[^;,\s]+=)/);
const proxyBaseUrl = env.dlsAdmin.proxyBaseUrl.replace(/\/+$/, "");

const absorbCookies = (headers: Headers) => {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.() ?? (
    headers.get("set-cookie") ? splitSetCookie(headers.get("set-cookie") as string) : []
  );

  for (const value of values) {
    const parts = value.split(";").map((part) => part.trim());
    const separator = parts[0].indexOf("=");
    if (separator < 1) {
      continue;
    }
    const name = parts[0].slice(0, separator);
    const cookieValue = parts[0].slice(separator + 1);
    let expiresAt: number | undefined;

    for (const attribute of parts.slice(1)) {
      const [key, ...rest] = attribute.split("=");
      if (key.toLowerCase() === "max-age") {
        expiresAt = Date.now() + Number(rest.join("=")) * 1000;
      }
      if (key.toLowerCase() === "expires") {
        const parsed = Date.parse(rest.join("="));
        if (!Number.isNaN(parsed)) {
          expiresAt = parsed;
        }
      }
    }

    if (cookieValue === "" || (expiresAt !== undefined && expiresAt <= Date.now())) {
      cookies.delete(name);
    } else {
      cookies.set(name, { value: cookieValue, expiresAt });
    }
  }
};

const cookieHeader = () => {
  const now = Date.now();
  for (const [name, cookie] of cookies) {
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
      cookies.delete(name);
    }
  }
  return [...cookies.entries()].map(([name, cookie]) => `${name}=${cookie.value}`).join("; ");
};

const assertBaseConfig = () => {
  if (!env.dlsAdmin.loginPath || !env.dlsAdmin.username || !env.dlsAdmin.password) {
    throw new ApiError(503, 5031, "DLS 관리자 로그인 설정이 필요합니다.");
  }
};

const requestHeaders = (includeSession: boolean) => {
  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "user-agent": "Book-on/1.0"
  };
  const cookie = includeSession ? cookieHeader() : "";
  if (cookie) {
    headers.cookie = cookie;
  }
  if (env.dlsAdmin.origin) {
    headers.origin = env.dlsAdmin.origin;
  }
  if (env.dlsAdmin.referer) {
    headers.referer = env.dlsAdmin.referer;
  }
  if (env.dlsAdmin.csrfHeader && env.dlsAdmin.csrfCookieName) {
    const csrf = cookies.get(env.dlsAdmin.csrfCookieName)?.value;
    if (csrf) {
      headers[env.dlsAdmin.csrfHeader] = decodeURIComponent(csrf);
    }
  }
  return headers;
};

const appendQuery = (path: string, query?: Query) => {
  if (!query) {
    return path;
  }
  const url = new URL(path, env.dlsAdmin.baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
};

const fetchDls = async (path: string, init?: RequestInit) => {
  let response: Response;
  try {
    response = await fetch(new URL(path, env.dlsAdmin.baseUrl), {
      ...init,
      headers: {
        ...requestHeaders(true),
        ...init?.headers
      },
      redirect: "manual",
      signal: AbortSignal.timeout(env.dlsAdmin.timeoutMs)
    });
  } catch {
    throw new ApiError(502, 5022, "DLS 관리자 서버에 연결할 수 없습니다.");
  }
  absorbCookies(response.headers);
  return response;
};

const parseResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || contentType.includes("text/json")) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const ensureSuccessfulDlsResponse = (body: unknown) => {
  if (!body || typeof body !== "object") {
    return body;
  }

  const payload = body as DlsRawResponse;
  const status = payload.status;
  if (!status || status === "SUCCESS" || status === "OK") {
    return body;
  }

  const message = payload.statusDescription || payload.statusDescrition || payload.message;
  throw new ApiError(502, 5022, String(message || "DLS 응답이 올바르지 않습니다."));
};

const performLogin = async () => {
  assertBaseConfig();
  cookies.clear();

  if (env.dlsAdmin.loginPagePath) {
    const pageResponse = await fetchDls(env.dlsAdmin.loginPagePath, { method: "GET" });
    if (!pageResponse.ok && pageResponse.status !== 302) {
      throw new ApiError(502, 5022, "DLS 관리자 로그인 페이지를 불러올 수 없습니다.");
    }
  }

  const credentials = {
    [env.dlsAdmin.usernameField]: env.dlsAdmin.username as string,
    [env.dlsAdmin.passwordField]: env.dlsAdmin.password as string
  };
  const form = new URLSearchParams(credentials);
  const isJson = env.dlsAdmin.loginContentType.toLowerCase() === "json";
  const isGet = env.dlsAdmin.loginMethod === "GET";
  const loginPath = isGet
    ? appendQuery(env.dlsAdmin.loginPath, credentials)
    : env.dlsAdmin.loginPath;
  const response = await fetchDls(loginPath, {
    method: env.dlsAdmin.loginMethod,
    ...(isGet
      ? {}
      : {
          headers: {
            "content-type": isJson
              ? "application/json"
              : "application/x-www-form-urlencoded"
          },
          body: isJson ? JSON.stringify(credentials) : form.toString()
        })
  });

  if (!response.ok && response.status !== 302 && response.status !== 303) {
    cookies.clear();
    throw new ApiError(502, 5022, "DLS 관리자 로그인에 실패했습니다.");
  }
  if (!cookieHeader()) {
    throw new ApiError(502, 5022, "DLS 로그인 세션 Cookie를 받지 못했습니다.");
  }
  sessionExpiresAt = Date.now() + env.dlsAdmin.sessionTtlMs;
};

export const ensureDlsAdminSession = async () => {
  if (sessionExpiresAt > Date.now() && cookieHeader()) {
    return;
  }
  if (!loginPromise) {
    loginPromise = performLogin().finally(() => {
      loginPromise = undefined;
    });
  }
  await loginPromise;
};

const requestWithSession = async (path: string, query?: Query, retry = true): Promise<unknown> => {
  await ensureDlsAdminSession();
  const response = await fetchDls(appendQuery(path, query), { method: "GET" });
  if ((response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) && retry) {
    sessionExpiresAt = 0;
    cookies.clear();
    return requestWithSession(path, query, false);
  }
  if (!response.ok) {
    throw new ApiError(502, 5022, `DLS 관리자 조회에 실패했습니다. (${response.status})`);
  }
  return parseResponse(response);
};

const requestPostForm = async (path: string, body: FormBody, retry = true) => {
  await ensureDlsAdminSession();
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      form.set(key, String(value));
    }
  }

  const response = await fetchDls(path, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: form.toString()
  });

  if ((response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) && retry) {
    sessionExpiresAt = 0;
    cookies.clear();
    return requestPostForm(path, body, false);
  }
  if (!response.ok) {
    throw new ApiError(502, 5022, `DLS 요청에 실패했습니다. (${response.status})`);
  }

  return ensureSuccessfulDlsResponse(await parseResponse(response));
};

const requirePath = (path: string, name: string) => {
  if (!path) {
    throw new ApiError(503, 5031, `${name} 경로 설정이 필요합니다.`);
  }
  return path;
};

const withIdentifier = (path: string, placeholder: string, param: string, value: string) => {
  if (path.includes(placeholder)) {
    return { path: path.replaceAll(placeholder, encodeURIComponent(value)), query: undefined };
  }
  return { path, query: { [param]: value } };
};

export const getDlsAdminSessionStatus = () => ({
  configured: Boolean(env.dlsAdmin.loginPath && env.dlsAdmin.username && env.dlsAdmin.password),
  active: sessionExpiresAt > Date.now() && Boolean(cookieHeader()),
  expiresAt: sessionExpiresAt > Date.now() ? new Date(sessionExpiresAt).toISOString() : null
});

export const searchDlsUsers = (query: Query) =>
  requestWithSession(requirePath(env.dlsAdmin.userSearchPath, "사용자 검색 API"), query);

export const getDlsUser = (userId: string) => {
  const target = withIdentifier(
    requirePath(env.dlsAdmin.userDetailPath, "사용자 정보 API"),
    "{userId}",
    env.dlsAdmin.userIdParam,
    userId
  );
  return requestWithSession(target.path, target.query);
};

export const getDlsLoanCount = (userId: string) => {
  const target = withIdentifier(
    requirePath(env.dlsAdmin.loanCountPath, "대출 권수 API"),
    "{userId}",
    env.dlsAdmin.userIdParam,
    userId
  );
  return requestWithSession(target.path, target.query);
};

export const getDlsLoanHistory = (userId: string, query: Query) => {
  const target = withIdentifier(
    requirePath(env.dlsAdmin.loanHistoryPath, "대출 기록 API"),
    "{userId}",
    env.dlsAdmin.userIdParam,
    userId
  );
  return requestWithSession(target.path, { ...target.query, ...query });
};

export const getDlsAdminBook = (bookId: string) => {
  const target = withIdentifier(
    requirePath(env.dlsAdmin.bookDetailPath, "도서 정보 API"),
    "{bookId}",
    env.dlsAdmin.bookIdParam,
    bookId
  );
  return requestWithSession(target.path, target.query);
};

const requestProxy = async (path: string, query?: Query) => {
  const url = new URL(path, `${proxyBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Book-on/1.0"
      },
      signal: AbortSignal.timeout(env.dls.timeoutMs)
    });
  } catch {
    throw new ApiError(502, 5021, "Book-on-DLS 서버에 연결할 수 없습니다.");
  }

  if (!response.ok) {
    throw new ApiError(502, 5021, `Book-on-DLS 서버 요청에 실패했습니다. (${response.status})`);
  }

  return ensureSuccessfulDlsResponse(await parseResponse(response));
};

export const searchDlsUsersByName = (name: string) =>
  requestProxy("/searchStudent", { name });

export const getDlsCurrentLoans = (userKey: string, userNo: string) =>
  requestProxy("/currentLoan", {
    user_key: userKey,
    user_no: userNo
  });

export const getDlsBookInfoByRegNos = (regNos: string) =>
  requestProxy("/bookInfo", { reg_nos: regNos });

export const searchDlsBooksByTitle = (query: string) =>
  requestProxy("/searchBook", { query });

export const getDlsLoanHistoryByUserKey = (
  userKey: string,
  startDate?: string,
  endDate?: string
) => {
  const now = new Date();
  const defaultEndDate = now.toISOString().slice(0, 10);
  const defaultStartDate = `${now.getFullYear() - 3}-03-01`;

  return requestProxy("/loanHistory", {
    user_key: userKey,
    start_date: startDate || defaultStartDate,
    end_date: endDate || defaultEndDate
  });
};

export const extendDlsLoan = (userKey: string, loanKey: string) =>
  requestProxy("/extendLoan", {
    user_key: userKey,
    loan_key: loanKey
  });
