const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// 실제 controller/mapper를 실행하되 외부 I/O 의존성은 모두 차단한다.
function load(relativePath, dependencies, clock) {
  const filename = path.join(__dirname, "..", relativePath);
  const override = relativePath === "src/controllers/public.controller.ts" ? process.argv[2]
    : relativePath === "src/controllers/library-books.controller.ts" ? process.argv[3] : undefined;
  const sourceFile = override && override !== "-" ? override : filename;
  const compiled = ts.transpileModule(fs.readFileSync(sourceFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, console, Intl, Date: clock,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  });
  new vm.Script(compiled, { filename }).runInContext(context);
  return module.exports;
}

async function main() {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const first = { bookKey: "8013429956", speciesKey: "KM1", regNo: "KM1", title: "First", regDate: "2026-01-02", coverUrl: "cover", status: "대출가능" };
  const second = { bookKey: "8013429957", speciesKey: "KM2", regNo: "KM2", title: "Second", regDate: "2026-01-01", coverUrl: "", status: "대출가능" };
  let popular = [first];
  let state = "대출가능";
  let lookups = 0;
  let enrichments = 0;
  let failEnrichment = false;
  let failCatalog = false;
  const pause = () => new Promise(resolve => setTimeout(resolve, 5));
  const dls = {
    async getDlsPopularBooks() { return popular; },
    async searchDlsBooks() { lookups += 1; await pause(); return { bookList: [first, second] }; },
    async getCatalogBooks() { if (failCatalog) throw new Error("catalog unavailable"); return []; },
    async enrichDlsBooks(books) {
      enrichments += 1; await pause();
      if (failEnrichment) throw new Error("enrichment unavailable");
      return books.map(book => ({ book, state: { status: state, coverUrl: book.coverUrl } }));
    },
    async getCachedDlsBookDetail(key) { return [first, second].find(book => book.speciesKey === key); },
    isDlsServiceError: () => false
  };
  const pool = { async query(sql, values = []) {
    if (sql === "banners") return [[], []];
    if (sql === "detail") return [values[0] === 53000000001 ? [{ libraryNumber: "DLS:KM1:KM1" }] : [], []];
    assert.ok(sql.startsWith("SELECT id, library_number"), sql);
    return [[{ id: 53000000001, libraryNumber: "DLS:KM1:KM1" }, { id: 53000000002, libraryNumber: "DLS:KM2:KM2" }].filter(row => values.includes(row.libraryNumber)), []];
  } };
  const api = load("src/lib/api.ts", {}, Clock);
  const productionDls = load("src/services/dls.ts", {
    "../config/env": { env: { dls: { provCode: "F10", neisCode: "isolated-school" } } },
    "../db/queries": { bookQueries: {} }, "../db/pool": { pool }, "../lib/api": api,
    "./notifications": { sendNewBookNotification() { throw new Error("Notifications are forbidden"); } }
  }, Clock);
  dls.serializeDlsBook = productionDls.serializeDlsBook;
  const mapper = load("src/services/library-book-mapper.ts", {
    "../db/pool": { pool }, "./dls": dls
  }, Clock);
  const dependencies = {
    "../services/library-book-mapper": mapper,
    "../services/dls": dls, "../db/pool": { pool }, "../lib/api": api,
    "../db/queries": { bookQueries: { findDlsBookLibraryNumber: id => ({ sql: "detail", values: [id] }), findUserFavorite: () => ({}) }, publicQueries: { listBanners: () => ({ sql: "banners", values: [] }) } },
    "../services/profile-image": {}
  };
  const publicController = load("src/controllers/public.controller.ts", dependencies, Clock);
  const library = load("src/controllers/library-books.controller.ts", dependencies, Clock);
  async function invoke(handler, query = {}, params = {}) {
    let body;
    const response = { status: () => response, json: result => { body = result; } };
    await handler({ query, params }, response);
    return body;
  }
  const home = await invoke(publicController.getHome);
  assert.equal(home.data.todayRecommendation.bookId, 53000000001);
  const detail = await invoke(library.getSchoolBook, {}, { bookId: home.data.todayRecommendation.bookId });
  assert.equal(detail.data.bookId, home.data.todayRecommendation.bookId);
  assert.equal(detail.data.title, "First");
  popular = [];
  assert.equal((await invoke(publicController.getHome)).data.todayRecommendation, null);
  const covered = await mapper.mapCanonicalDlsBooks([first, second], { requireCover: true });
  assert.deepEqual(Array.from(covered, book => book.bookId), [53000000001]);
  assert.equal((await mapper.mapCanonicalDlsBooks([{ ...first, regNo: "unknown" }])).length, 0);

  enrichments = 0;
  const results = await Promise.all(Array.from({ length: 4 }, () => invoke(library.listSchoolNewBooks, { size: "1" })));
  assert.equal(lookups, 10, "Concurrent cold requests must share the ten DLS lookups");
  assert.equal(enrichments, 1, "Concurrent new-book requests must share enrichment");
  assert.ok(results.every(result => result.data.items[0].bookId === 53000000001));
  assert.ok(results.every(result => result.data.pagination.totalCount === 2 && result.data.pagination.hasNext));
  state = "대출중";
  const warm = await invoke(library.listSchoolNewBooks, { page: "2", size: "1" });
  assert.equal(lookups, 10);
  assert.equal(enrichments, 2, "Completed mapping must not cache stale loan state");
  assert.equal(warm.data.items[0].bookId, 53000000002);
  assert.equal(warm.data.items[0].loanAvailable, false);
  assert.equal(warm.data.pagination.hasNext, false);
  failEnrichment = true;
  const beforeFailure = enrichments;
  const failures = await Promise.allSettled(Array.from({ length: 4 }, () => invoke(library.listSchoolNewBooks)));
  assert.ok(failures.every(result => result.status === "rejected"));
  assert.equal(enrichments, beforeFailure + 1);
  failEnrichment = false;
  assert.equal((await invoke(library.listSchoolNewBooks)).data.items.length, 2);
  now += 61000;
  failCatalog = true;
  const coldFailures = await Promise.allSettled(Array.from({ length: 4 }, () => invoke(library.listSchoolNewBooks)));
  assert.ok(coldFailures.every(result => result.status === "rejected"));
  failCatalog = false;
  await invoke(library.listSchoolNewBooks);
  assert.equal(lookups, 30, "Failed cache generation must permit the next cold retry");
  console.log("Canonical home/detail, empty/cover/unmapped, concurrent cold/warm, fresh state, pagination and failure recovery passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
