import { authQueries } from "../db/queries";
import { pool } from "../db/pool";
import { ApiError } from "../lib/api";
import { Read365SessionRow } from "../types/read365.types";

const READ365_BASE_URL = "https://read365.edunet.net";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

type Read365CheckTokenResponse = {
  status?: string;
  data?: number;
  message?: string;
};

type Read365MarathonListResponse = {
  status?: string;
  message?: string;
  data?: {
    list?: {
      data?: Array<Record<string, unknown>>;
    };
  };
};

type Read365RefreshResponse = {
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
};

type Read365DailyLogResponse = {
  status?: string;
  message?: string;
  data?: {
    list?: {
      data?: Array<Record<string, unknown>>;
    };
  };
};

const getSession = async (userId: number) => {
  const q = authQueries.findRead365SessionByUserId(userId);
  const [rows] = await pool.query<Read365SessionRow[]>(q.sql, q.values);
  return rows[0];
};

const deleteSession = async (userId: number) => {
  const q = authQueries.deleteRead365SessionByUserId(userId);
  await pool.query(q.sql, q.values);
};

const requireSession = async (userId: number) => {
  const session = await getSession(userId);
  if (!session) {
    throw new ApiError(401, 4014, "read365 세션이 없습니다. 다시 로그인해 주세요.");
  }
  if (Date.parse(session.sessionExpiresAt) <= Date.now()) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (!session.memberKey || !session.schoolKey || !session.accessToken) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션 정보가 불완전합니다. 다시 로그인해 주세요.");
  }
  return session;
};

const requestRead365 = async <T>(
  session: Read365SessionRow,
  path: string,
  referer: string
) => {
  const url = new URL(path, READ365_BASE_URL);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "ko-KR,ko;q=0.9",
      cookie: session.cookieHeader,
      referer,
      schkey: session.schoolKey ?? "",
      token: session.accessToken ?? "",
      userid: session.read365Id,
      "user-agent": USER_AGENT
    },
    signal: AbortSignal.timeout(15000)
  }).catch(() => {
    throw new ApiError(502, 5024, "read365 마라톤 서버에 연결하지 못했습니다.");
  });

  if (!response.ok) {
    throw new ApiError(502, 5024, `read365 마라톤 요청에 실패했습니다. (${response.status})`);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new ApiError(502, 5024, "read365 마라톤 응답을 해석하지 못했습니다.");
  }
};

const assertValidSession = async (userId: number, session: Read365SessionRow) => {
  const response = await requestRead365<Read365CheckTokenResponse>(
    session,
    `/schome/auth/member/checkToken?id=${encodeURIComponent(session.read365Id)}`,
    `${READ365_BASE_URL}/High/contestMarathonDetail`
  );

  if (response.status !== "OK" || response.data !== 1) {
    await deleteSession(userId);
    throw new ApiError(401, 4014, "read365 세션이 유효하지 않습니다. 다시 로그인해 주세요.");
  }
};

const toContestSummary = (contest: Record<string, unknown>) => ({
  readingMarathonKey: String(contest.readingMarathonKey ?? ""),
  contestName: contest.contestName ?? null,
  contestSummary: contest.contestSummary ?? null,
  contestStartDate: contest.contestStartDate ?? null,
  contestEndDate: contest.contestEndDate ?? null,
  progressStatusCode: contest.progressStatusCode ?? null,
  progressStatusName: contest.progressStatusName ?? null,
  myJoinYN: contest.myJoinYN ?? null,
  myFinishYN: contest.myFinishYN ?? null,
  myJoinDate: contest.myJoinDate ?? null,
  myTotalPage: Number(contest.myTotalPage ?? 0),
  totalJoinCount: Number(contest.totalJoinCount ?? 0),
  finishYJoinCount: Number(contest.finishYJoinCount ?? 0),
  finishNJoinCount: Number(contest.finishNJoinCount ?? 0),
  deadLineDays: Number(contest.deadLineDays ?? 0),
  course: Array.isArray(contest.marathonCourseList)
    ? (contest.marathonCourseList as Array<Record<string, unknown>>)
        .find((course) => course.myCourseYN === "Y")
    : null
});

const toProgressEntry = (item: Record<string, unknown>) => ({
  certainBookKey: item.certainBookKey ?? null,
  bookKey: item.bookKey ?? null,
  titleInfo: item.titleInfo ?? null,
  author: item.author ?? null,
  publisher: item.publisher ?? null,
  coverUrl: item.coverUrl ?? null,
  page: Number(item.page ?? 0),
  myTotalPage: Number(item.myTotalPage ?? 0),
  statusCodeList: item.statusCodeList ?? null,
  statusNameList: item.statusNameList ?? null,
  dailyLogs: Array.isArray(item.dailyLogList)
    ? (item.dailyLogList as Array<Record<string, unknown>>).map((log) => ({
        readingMarathonDailyLogKey: log.readingMarathonDailyLogKey ?? null,
        startPage: Number(log.startPage ?? 0),
        endPage: Number(log.endPage ?? 0),
        readingPage: Number(log.readingPage ?? 0),
        logTitle: log.logTitle ?? null,
        logContent: log.logContent ?? null,
        regDate: log.regDate ?? null,
        statusCode: log.statusCode ?? null
      }))
    : []
});

export const getRead365Marathon = async (userId: number) => {
  const session = await requireSession(userId);
  await assertValidSession(userId, session);

  const listResponse = await requestRead365<Read365MarathonListResponse>(
    session,
    `/schome/service/readingActivitesJoin/readingMarathon/schoolList?schKey=${encodeURIComponent(session.schoolKey!)}&privacyBoundsCode=02&progressStatusCode=&statusCode=02&contestName=&contestSummary=&myMakeYN=N&myJoinYN=N&memberKey=${encodeURIComponent(session.memberKey!)}&pageIndex=1&pageSize=20`,
    `${READ365_BASE_URL}/High/contestMarathon?myJoinYN=N&myMakeYN=N&statusCode=02&progressStatusCode=&privacyBoundsCode=02&searchType=ALL&page=1&scroll=no`
  );

  if (listResponse.status !== "OK") {
    throw new ApiError(502, 5024, listResponse.message || "read365 마라톤 목록 조회에 실패했습니다.");
  }

  const contests = listResponse.data?.list?.data ?? [];
  const activeContests = contests.filter(
    (contest) => contest.progressStatusCode === "02" && contest.myJoinYN === "Y" && contest.myFinishYN !== "Y"
  );

  const details = await Promise.all(
    activeContests.map(async (contest) => {
      const readingMarathonKey = String(contest.readingMarathonKey ?? "");
      const detailResponse = await requestRead365<Read365DailyLogResponse>(
        session,
        `/schome/service/readingActivitesJoin/readingMarathon/dailyLog/list?readingMarathonKey=${encodeURIComponent(readingMarathonKey)}&memberKey=${encodeURIComponent(session.memberKey!)}&pageSize=100&pageIndex=1&statusCode=&titleInfo=&memberGrade=&memberClass=&name=&author=`,
        `${READ365_BASE_URL}/High/contestMarathonDetail?index=${encodeURIComponent(readingMarathonKey)}`
      );

      if (detailResponse.status !== "OK") {
        throw new ApiError(502, 5024, detailResponse.message || "read365 마라톤 진행 정보 조회에 실패했습니다.");
      }

      return {
        ...toContestSummary(contest),
        progressBooks: (detailResponse.data?.list?.data ?? []).map((item) => toProgressEntry(item))
      };
    })
  );

  return {
    read365Id: session.read365Id,
    memberKey: session.memberKey,
    schoolKey: session.schoolKey,
    activeCount: details.length,
    marathons: details
  };
};

export const getRead365MyInfo = async (userId: number) => {
  const session = await requireSession(userId);
  await assertValidSession(userId, session);

  const response = await requestRead365<Read365RefreshResponse>(
    session,
    "/schome/auth/member/refresh",
    `${READ365_BASE_URL}/`
  );

  if (response.status !== "OK") {
    throw new ApiError(502, 5024, response.message || "read365 내 정보 조회에 실패했습니다.");
  }

  return {
    read365Id: session.read365Id,
    memberKey: session.memberKey,
    schoolKey: session.schoolKey,
    profile: response.data ?? null
  };
};
