const dotenv = require("dotenv");

dotenv.config();

const required = [
  "ADMIN_API_KEY",
  "DLS_ADMIN_LOGIN_PATH",
  "DLS_ADMIN_USERNAME",
  "DLS_ADMIN_PASSWORD",
  "DLS_ADMIN_USER_SEARCH_PATH",
  "DLS_ADMIN_USER_DETAIL_PATH",
  "DLS_ADMIN_LOAN_COUNT_PATH",
  "DLS_ADMIN_LOAN_HISTORY_PATH",
  "DLS_ADMIN_BOOK_DETAIL_PATH"
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}

if (!/^[\x20-\x7E]+$/.test(process.env.ADMIN_API_KEY)) {
  console.error(JSON.stringify({
    ok: false,
    message: "ADMIN_API_KEY는 HTTP 헤더로 보낼 수 있는 영문/숫자/기호로 설정해야 합니다."
  }, null, 2));
  process.exit(1);
}

const { app } = require("../dist/app");
const { pool } = require("../dist/db/pool");

const server = app.listen(0);

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const run = async () => {
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-admin-key": process.env.ADMIN_API_KEY };
  const results = [];

  const request = async (name, path, init = {}, validate = (body) => body?.errorCode === 0) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {})
      }
    });
    const body = await readJson(response);
    const pass = response.status >= 200 && response.status < 300 && validate(body);
    results.push({
      name,
      status: response.status,
      pass,
      errorCode: body?.errorCode,
      message: body?.message
    });
    return body;
  };

  await request("POST /admin/dls/session", "/admin/dls/session", { method: "POST" });
  await request("GET /admin/dls/session", "/admin/dls/session", {}, (body) =>
    body?.errorCode === 0 && body?.data?.configured === true && body?.data?.active === true
  );

  const userQuery = process.env.DLS_ADMIN_TEST_USER_QUERY;
  const userId = process.env.DLS_ADMIN_TEST_USER_ID;
  const bookId = process.env.DLS_ADMIN_TEST_BOOK_ID;

  if (userQuery) {
    await request("GET /admin/dls/users", `/admin/dls/users?keyword=${encodeURIComponent(userQuery)}`);
  }

  if (userId) {
    await request("GET /admin/dls/users/:userId", `/admin/dls/users/${encodeURIComponent(userId)}`);
    await request(
      "GET /admin/dls/users/:userId/loans/count",
      `/admin/dls/users/${encodeURIComponent(userId)}/loans/count`
    );
    await request(
      "GET /admin/dls/users/:userId/loans",
      `/admin/dls/users/${encodeURIComponent(userId)}/loans`
    );
  }

  if (bookId) {
    await request("GET /admin/dls/books/:bookId", `/admin/dls/books/${encodeURIComponent(bookId)}`);
  }

  await new Promise((resolve) => server.close(resolve));
  await pool.end();

  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => !result.pass)) {
    process.exit(1);
  }
};

run().catch(async (error) => {
  await new Promise((resolve) => server.close(resolve)).catch(() => undefined);
  await pool.end().catch(() => undefined);
  console.error(JSON.stringify({
    ok: false,
    name: error.name,
    message: error.message,
    status: error.status,
    errorCode: error.errorCode
  }, null, 2));
  process.exit(1);
});
