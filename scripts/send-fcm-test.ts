import { notificationQueries } from "../src/db/queries";
import { runMigrations } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { RowDataPacket } from "../src/db/types";
import { disableFcmToken, sendFcmMessage } from "../src/services/fcm";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
};

type TokenRow = RowDataPacket & { token: string };

const usage = `사용법:
  npm run fcm:test -- --user-id <id> --title <title> --body <body> [--data '<json>']

data 생략 시 기본값:
  {"type":"notice","noticeId":"0"}`;

const getOption = (args: string[], name: string) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} 값이 필요합니다.`);
  }
  return value;
};

const parseUserId = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error("--user-id는 양의 정수여야 합니다.");
  }
  return Number(value);
};

const parseData = (value: string | undefined): Record<string, string> => {
  if (!value) {
    return { type: "notice", noticeId: "0" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("--data는 올바른 JSON이어야 합니다.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--data는 JSON 객체여야 합니다.");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new Error("--data의 모든 값은 문자열이어야 합니다.");
  }

  return Object.fromEntries(entries) as Record<string, string>;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const userId = parseUserId(getOption(args, "--user-id"));
  const title = getOption(args, "--title")?.trim();
  const body = getOption(args, "--body")?.trim();
  const data = parseData(getOption(args, "--data"));

  if (!title) throw new Error("--title은 필수입니다.");
  if (!body) throw new Error("--body는 필수입니다.");

  await runMigrations();
  const userQuery = notificationQueries.findUserForFcmTest(userId);
  const [users] = await pool.query<UserRow[]>(userQuery.sql, userQuery.values);
  const user = users[0];
  if (!user) throw new Error(`사용자 ID ${userId}를 찾을 수 없습니다.`);

  const tokenQuery = notificationQueries.listActiveFcmTokens(userId);
  const [tokens] = await pool.query<TokenRow[]>(tokenQuery.sql, tokenQuery.values);
  if (tokens.length === 0) {
    throw new Error(`사용자 ID ${userId}에게 활성 FCM 토큰이 없습니다.`);
  }

  let sent = 0;
  let failed = 0;
  for (const { token } of tokens) {
    try {
      const result = await sendFcmMessage({ token, title, body, data });
      if (result.sent) {
        sent += 1;
      } else {
        failed += 1;
        if (result.invalidToken) await disableFcmToken(token);
      }
    } catch (error) {
      failed += 1;
      console.error("FCM 발송 실패:", error);
    }
  }

  console.log(`FCM 테스트 알림 발송 완료: ${user.name} (${user.email})`);
  console.log(`대상 토큰: ${tokens.length}, 성공: ${sent}, 실패: ${failed}`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    console.error(usage);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
