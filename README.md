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
- `DLS_TIMEOUT_MS`: DLS 프록시 요청 타임아웃

## read365 기능

- `POST /auth/read365/login`
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
