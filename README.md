# Book-on-Backend-v1

`read365` 개인 계정 로그인과 세션 기반 조회, 그리고 `Book-on-DLS-v1` 프록시 기반 DLS 조회/실행 API를 제공하는 백엔드입니다.

## 실행

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

배포 시에도 `npm start`가 시작 전에 `npm run db:migrate`를 실행하므로 운영 DB의 미적용 마이그레이션을 자동 적용합니다. 현재 알림 이력 기능에 필요한 `007_notification_history.sql`도 이 방식으로 적용됩니다.

## 환경 변수

- `SQLITE_PATH`: SQLite DB 경로
- `JWT_SECRET`: JWT 서명 키
- `READ365_BASE_URL`: read365 서버 URL. 기본값 `https://read365.edunet.net`
- `READ365_TIMEOUT_MS`: read365 요청 타임아웃. 기본값 `15000`
- `DLS_PROXY_BASE_URL`: `Book-on-DLS-v1` 프록시 서버 URL. 예: `http://localhost:3001`
- `DLS_PROV_CODE`: 기본값 `F10`
- `DLS_NEIS_CODE`: 기본값 `F100000120`
- `DLS_SCHOOL_NAME`: 학교명
- `DLS_POPULAR_KEYWORD`: 인기/추천 도서 조회에 사용할 검색어. 비어 있으면 `DLS_SCHOOL_NAME`, 그다음 `소프트웨어`를 사용
- `DLS_TIMEOUT_MS`: DLS 프록시 요청 타임아웃
- `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`: Firebase 서비스 계정 정보
- `FCM_SERVICE_ACCOUNT_JSON`: Firebase 서비스 계정 JSON 문자열 또는 base64 JSON. 개별 FCM 환경 변수 대신 사용 가능
- `FCM_SCHEDULER_ENABLED`: 반납/공지 푸시 스케줄러 사용 여부. 기본값 `true`
- `FCM_DUE_REMINDER_HOUR`: 반납 알림 발송 시각. 기본값 `9`
- `FCM_NOTICE_POLL_INTERVAL_MS`: 새 공지 감지 주기. 기본값 `300000`

## read365 기능

- `POST /auth/read365/login`
- `POST /auth/read365/session`
- `POST /auth/read365/session/extend`
- `GET /marathon`
- `GET /marathon/read365/myinfo`

## DLS 프록시 기능

- `GET /dls/returnDate`
- `GET /dls/searchStudent`
- `GET /dls/currentLoan`
- `GET /dls/bookInfo`
- `GET /dls/loanHistory`
- `GET /dls/execution`
- `GET /dls/searchBook`
- `GET /dls/extendLoan`

## 알림 기능

- `POST /me/fcm-token`
- `DELETE /me/fcm-token`
- `PATCH /me/notification-settings`
- 반납 3일 전/당일 푸시 알림
- 새 도서부 공지 푸시 알림

## 도서 조회 회귀 검증

의존성 설치 후 다음 명령으로 TypeScript 빌드와 도서 조회 회귀 검증을 실행합니다. 검증 스크립트는 Node.js 24.15.0 환경에서 확인했으며 기존 개발 의존성인 TypeScript가 필요합니다.

```bash
npm run build
npm run test:library-discovery
```

`scripts/test-library-discovery.cjs`는 실제 TypeScript controller와 mapper를 VM에서 실행하며 DB·DLS 의존성을 모의 구현으로 대체해 외부 I/O를 차단합니다. 다음 항목을 검증합니다.

- 홈 추천 도서의 canonical ID와 상세 조회 ID 일치, 빈 추천 목록, 표지가 없는 도서 필터링, DB에 매핑되지 않은 도서 제외.
- 신간 조회 동시 cold 요청 4개의 DLS 검색 10회 및 enrichment 1회 공유, warm 요청의 추가 DLS 검색 0회.
- warm 요청에서 대출 상태 재조회, 페이지별 결과·페이지 정보, enrichment 및 캐시 생성 실패 후 재시도.

이 검증은 실제 DB, DLS 서버, 운영 FCM, 배포 서버 또는 Android 앱의 전체 기능 테스트를 대신하지 않습니다.
