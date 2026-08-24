# Book-on-Backend-v1

`read365` 개인 계정 로그인과 세션 기반 조회, 그리고 `Book-on-DLS-v1` 프록시 기반 DLS 조회/실행 API를 제공하는 백엔드입니다.

## 실행

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

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
