import { notificationQueries } from "../src/db/queries";
import { runMigrations } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { RowDataPacket } from "../src/db/types";

type FcmUserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  activeTokenCount: number;
};

const main = async () => {
  await runMigrations();
  const query = notificationQueries.listUsersForFcmTest();
  const [rows] = await pool.query<FcmUserRow[]>(query.sql, query.values);

  if (rows.length === 0) {
    console.log("등록된 사용자가 없습니다.");
    return;
  }

  console.table(rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    activeFcmTokens: Number(row.activeTokenCount),
  })));
};

main()
  .catch((error) => {
    console.error("사용자 목록을 조회하지 못했습니다.", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
