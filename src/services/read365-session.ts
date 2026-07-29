import { env } from "../config/env";
import { pool } from "../db/pool";
import { authQueries } from "../db/queries";
import { ApiError } from "../lib/api";
import { Read365SessionRow } from "../types/read365.types";

type Cookie = {
  value: string;
  expiresAt?: number;
};

type RefreshResponse = {
  status?: string;
  message?: string;
  data?: {
    memberKey?: string;
    schKey?: string;
    id?: string;
    name?: string;
    dlsToken?: {
      accessToken?: string;
      tokenType?: string;
    };
    refreshToken?: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const toPublicProfile = (data?: RefreshResponse["data"]) => {
  if (!data) {
    return null;
  }

  return {
    memberKey: data.memberKey ?? null,
    schKey: data.schKey ?? null,
    id: data.id ?? null,
    name: data.name ?? null
  };
};

const READ365_BASE_URL = env.read365.baseUrl;
const STSSO_BASE_URL = "https://stsso2.edunet.net";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 120;

const splitSetCookie = (value: string) => value.split(/,(?=\s*[^;,\s]+=)/);

class CookieJar {
  private readonly cookies = new Map<string, Cookie>();

  absorbCookieHeader(cookieHeader: string) {
    for (const cookie of cookieHeader.split(";")) {
      const trimmed = cookie.trim();
      const separator = trimmed.indexOf("=");
      if (separator < 1) {
        continue;
      }

      const name = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1);
      if (name && value) {
        this.cookies.set(name, { value });
      }
    }
  }

  absorb(headers: Headers) {
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
        const normalizedKey = key.toLowerCase();
        if (normalizedKey === "max-age") {
          expiresAt = Date.now() + Number(rest.join("=")) * 1000;
        }
        if (normalizedKey === "expires") {
          const parsed = Date.parse(rest.join("="));
          if (!Number.isNaN(parsed)) {
            expiresAt = parsed;
          }
        }
      }

      if (!cookieValue || (expiresAt !== undefined && expiresAt <= Date.now())) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, { value: cookieValue, expiresAt });
      }
    }
  }

  toHeader() {
    const now = Date.now();
    for (const [name, cookie] of this.cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        this.cookies.delete(name);
      }
    }
    return [...this.cookies.entries()].map(([name, cookie]) => `${name}=${cookie.value}`).join("; ");
  }

  get(name: string) {
    return this.cookies.get(name)?.value;
  }

  getSessionExpiry() {
    const expiresAt = this.cookies.get("JSESSIONID")?.expiresAt;
    return typeof expiresAt === "number" && expiresAt > Date.now()
      ? expiresAt
      : Date.now() + DEFAULT_SESSION_TTL_MS;
  }
}

const extractHiddenInputs = (html: string) => {
  const inputs: Record<string, string> = {};
  const pattern = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    inputs[match[1]] = match[2];
  }
  return inputs;
};

const extractFormAction = (html: string) => {
  const match = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ?? null;
};

const parseJson = async <T>(response: Response) => {
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError(502, 5023, "read365 응답을 해석하지 못했습니다.");
  }
};

const assertOk = async (response: Response, message: string) => {
  if (response.ok) {
    return;
  }
  const text = await response.text().catch(() => "");
  throw new ApiError(502, 5023, `${message} (${response.status})`, text || null);
};

const request = async (
  jar: CookieJar,
  url: string,
  init: RequestInit = {}
) => {
  const headers = new Headers(init.headers);
  headers.set("user-agent", USER_AGENT);
  headers.set("accept", headers.get("accept") ?? "*/*");
  headers.set("accept-language", "ko-KR,ko;q=0.9");
  const cookieHeader = jar.toHeader();
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(15000)
  }).catch(() => {
    throw new ApiError(502, 5023, "read365 로그인 서버에 연결하지 못했습니다.");
  });

  jar.absorb(response.headers);
  return response;
};

const saveSession = async (
  userId: number,
  read365Id: string,
  cookieHeader: string,
  sessionExpiresAt: string,
  refresh?: RefreshResponse
) => {
  const q = authQueries.upsertRead365Session(
    userId,
    read365Id,
    cookieHeader,
    refresh?.data?.memberKey ?? null,
    refresh?.data?.schKey ?? null,
    refresh?.data?.dlsToken?.accessToken ?? null,
    refresh?.data?.refreshToken ?? null,
    sessionExpiresAt
  );
  await pool.query(q.sql, q.values);
};

const deleteSession = async (userId: number) => {
  const q = authQueries.deleteRead365SessionByUserId(userId);
  await pool.query(q.sql, q.values);
};

const findSession = async (userId: number) => {
  const q = authQueries.findRead365SessionByUserId(userId);
  const [sessions] = await pool.query<Read365SessionRow[]>(q.sql, q.values);
  return sessions[0];
};

const assertStoredSession = async (userId: number) => {
  const session = await findSession(userId);
  if (!session) {
    throw new ApiError(401, 4014, "read365 세션이 없습니다. 다시 로그인해 주세요.");
  }

  const expiresAt = Date.parse(session.sessionExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션이 만료되었습니다. 다시 로그인해 주세요.");
  }

  if (!session.cookieHeader) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션 정보가 불완전합니다. 다시 로그인해 주세요.");
  }

  return session;
};

export const registerRead365Session = async (
  userId: number,
  cookieHeader: string,
  expectedRead365Id?: string,
  requestedSessionExpiresAt?: string
) => {
  if (!cookieHeader.trim() || /[\r\n]/.test(cookieHeader)) {
    throw new ApiError(422, 4222, "read365 세션 Cookie를 입력해 주세요.", { field: "cookieHeader" });
  }

  const jar = new CookieJar();
  jar.absorbCookieHeader(cookieHeader);
  if (!jar.toHeader()) {
    throw new ApiError(422, 4222, "read365 세션 Cookie 형식이 올바르지 않습니다.", { field: "cookieHeader" });
  }

  const refreshResponse = await request(jar, `${READ365_BASE_URL}/schome/auth/member/refresh`, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      referer: `${READ365_BASE_URL}/`
    }
  });
  await assertOk(refreshResponse, "read365 세션 확인에 실패했습니다.");
  const refreshBody = await parseJson<RefreshResponse>(refreshResponse);
  if (refreshBody.status && refreshBody.status !== "OK") {
    throw new ApiError(401, 4014, refreshBody.message || "read365 세션이 유효하지 않습니다.");
  }

  const read365Id = refreshBody.data?.id ?? expectedRead365Id;
  if (!read365Id) {
    throw new ApiError(401, 4014, "read365 세션에서 사용자 정보를 확인할 수 없습니다.");
  }
  if (expectedRead365Id && refreshBody.data?.id && expectedRead365Id !== refreshBody.data.id) {
    throw new ApiError(401, 4014, "read365 세션 사용자 정보가 일치하지 않습니다.");
  }

  const refreshedCookieHeader = jar.toHeader();
  if (!refreshedCookieHeader) {
    throw new ApiError(401, 4014, "read365 세션 Cookie가 유효하지 않습니다.");
  }

  const requestedExpiresAt = requestedSessionExpiresAt ? Date.parse(requestedSessionExpiresAt) : NaN;
  const sessionExpiresAt = new Date(
    Number.isFinite(requestedExpiresAt) && requestedExpiresAt > Date.now()
      ? Math.min(requestedExpiresAt, jar.getSessionExpiry())
      : jar.getSessionExpiry()
  ).toISOString();
  await saveSession(userId, read365Id, refreshedCookieHeader, sessionExpiresAt, refreshBody);

  return {
    read365Id,
    sessionExpiresAt,
    profile: toPublicProfile(refreshBody.data)
  };
};

export const extendRead365Session = async (userId: number) => {
  const session = await assertStoredSession(userId);
  const jar = new CookieJar();
  jar.absorbCookieHeader(session.cookieHeader);

  if (!jar.toHeader()) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션 Cookie가 유효하지 않습니다. 다시 로그인해 주세요.");
  }

  const refreshResponse = await request(jar, `${READ365_BASE_URL}/schome/auth/member/refresh`, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      referer: `${READ365_BASE_URL}/`
    }
  });
  await assertOk(refreshResponse, "read365 세션 연장에 실패했습니다.");
  const refreshBody = await parseJson<RefreshResponse>(refreshResponse);
  if (refreshBody.status && refreshBody.status !== "OK") {
    await deleteSession(userId);
    throw new ApiError(401, 4014, refreshBody.message || "read365 세션이 유효하지 않습니다. 다시 로그인해 주세요.");
  }

  if (refreshBody.data?.id && refreshBody.data.id !== session.read365Id) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션 사용자 정보가 일치하지 않습니다. 다시 로그인해 주세요.");
  }

  const refreshedCookieHeader = jar.toHeader();
  if (!refreshedCookieHeader) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션 Cookie가 유효하지 않습니다. 다시 로그인해 주세요.");
  }

  const read365Id = refreshBody.data?.id ?? session.read365Id;
  const sessionExpiresAt = new Date(jar.getSessionExpiry()).toISOString();
  await saveSession(userId, read365Id, refreshedCookieHeader, sessionExpiresAt, refreshBody);

  return {
    read365Id,
    sessionExpiresAt,
    profile: toPublicProfile(refreshBody.data)
  };
};

export const loginRead365Session = async (userId: number, read365Id: string, password: string) => {
  const jar = new CookieJar();

  const landingResponse = await request(jar, `${READ365_BASE_URL}/`, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!landingResponse.ok && landingResponse.status !== 302) {
    throw new ApiError(502, 5023, "read365 초기 페이지를 불러오지 못했습니다.");
  }

  const loginForm = new URLSearchParams({
    userID: read365Id,
    password,
    ssosite: "read365.edunet.net",
    credType: "BASIC",
    returnURL: "https://read365.edunet.net/ResLogin"
  });
  const loginServiceResponse = await request(jar, `${STSSO_BASE_URL}/nsso-authweb/loginService.do`, {
    method: "POST",
    headers: {
      origin: READ365_BASE_URL,
      referer: `${READ365_BASE_URL}/`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: loginForm.toString()
  });
  await assertOk(loginServiceResponse, "read365 SSO 1차 로그인에 실패했습니다.");
  const loginServiceHtml = await loginServiceResponse.text();
  const loginServiceInputs = extractHiddenInputs(loginServiceHtml);
  const loginDomainAction = extractFormAction(loginServiceHtml) ?? "/nsso-authweb/loginDomain.do";

  if (!loginServiceInputs.domainCred) {
    throw new ApiError(401, 4013, "read365 아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  const loginDomainResponse = await request(
    jar,
    new URL(loginDomainAction, STSSO_BASE_URL).toString(),
    {
      method: "POST",
      headers: {
        origin: STSSO_BASE_URL,
        referer: `${STSSO_BASE_URL}/nsso-authweb/loginService.do`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(loginServiceInputs).toString()
    }
  );
  await assertOk(loginDomainResponse, "read365 SSO 2차 로그인에 실패했습니다.");
  const loginDomainHtml = await loginDomainResponse.text();
  const resLoginAction = extractFormAction(loginDomainHtml) ?? `${READ365_BASE_URL}/ResLogin`;

  const resLoginResponse = await request(jar, new URL(resLoginAction, READ365_BASE_URL).toString(), {
    method: "POST",
    headers: {
      origin: STSSO_BASE_URL,
      referer: `${STSSO_BASE_URL}/`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: ""
  });
  await assertOk(resLoginResponse, "read365 최종 로그인 처리에 실패했습니다.");
  await resLoginResponse.text();

  const refreshResponse = await request(jar, `${READ365_BASE_URL}/schome/auth/member/refresh`, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      referer: `${READ365_BASE_URL}/`
    }
  });
  await assertOk(refreshResponse, "read365 세션 확인에 실패했습니다.");
  const refreshBody = await parseJson<RefreshResponse>(refreshResponse);
  if (refreshBody.status && refreshBody.status !== "OK") {
    throw new ApiError(401, 4013, refreshBody.message || "read365 로그인에 실패했습니다.");
  }

  const cookieHeader = jar.toHeader();
  if (!cookieHeader) {
    throw new ApiError(502, 5023, "read365 세션 쿠키를 받지 못했습니다.");
  }

  const sessionExpiresAt = new Date(jar.getSessionExpiry()).toISOString();
  await saveSession(userId, read365Id, cookieHeader, sessionExpiresAt, refreshBody);

  return {
    read365Id,
    cookie: cookieHeader,
    sessionExpiresAt,
    profile: toPublicProfile(refreshBody.data),
    jsessionId: jar.get("JSESSIONID") ?? null
  };
};
