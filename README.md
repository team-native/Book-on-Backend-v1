# Book-on-Backend-v1

`read365` 개인 계정 로그인과 세션 기반 조회를 제공하는 백엔드입니다.

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
- `DLS_BASE_URL`: 기본값 `https://read365.edunet.net`
- `DLS_PROV_CODE`: 기본값 `F10`
- `DLS_NEIS_CODE`: 기본값 `F100000120`
- `DLS_SCHOOL_NAME`: 학교명
- `DLS_TIMEOUT_MS`: read365 요청 타임아웃

## 현재 read365 기능

- `POST /auth/read365/login`
- `GET /marathon`
- `GET /marathon/read365/myinfo`
