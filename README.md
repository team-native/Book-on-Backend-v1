# Book-on Backend (v1)

광주소프트웨어마이스터고등학교 도서관 앱 **Book-on**의 백엔드 서버입니다.  
학교 DLS(도서관 서비스)와 연동하여 도서 조회, 대출 신청, 다독 랭킹 등의 기능을 제공합니다.

## 기술 스택

| 분류 | 기술 |
|------|------|
| 런타임 | Node.js |
| 언어 | TypeScript |
| 프레임워크 | Express.js |
| 데이터베이스 | MySQL 8+ |

## 서버 시작

### 요구사항

- Node.js 20+
- MySQL 8+

### 설치

```bash
npm install
```

### 환경 변수 설정

`.env.example`을 복사하여 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

필수 항목:

| 변수 | 설명 |
|------|------|
| `MYSQL_HOST` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | MySQL 접속 정보 |
| `JWT_SECRET` | JWT 서명용 비밀 키 (긴 무작위 문자열) |
| `ADMIN_API_KEY` | 관리자 API 인증 키 (`JWT_SECRET`과 다른 값) |

선택 항목:

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 이메일 발송 설정 (미설정 시 비밀번호 재설정 불가) | — |
| `DLS_*` | DLS 공개 API 연동 정보 | 광주소마고 기본값 |
| `DLS_ADMIN_*` | DLS 관리자 API 연동 정보 | — |
| `LOAN_DAYS` | 대출 기간 (일) | `14` |
| `EXTENSION_DAYS` | 연장 기간 (일) | `7` |

### DB 마이그레이션

```bash
npm run db:migrate
```

### 개발 서버 실행

```bash
npm run dev
```

### 프로덕션 빌드 및 실행

```bash
npm run build
npm start
```

## DLS 연동

학교 도서 데이터는 DLS 공개 API(`read365.edunet.net`)에서 실시간으로 조회합니다.  
조회된 도서는 로컬 `books` 테이블에 upsert 방식으로 동기화되어 대출·관심 도서 기능과 연결됩니다.

DLS 관리자 API(`dls.edunet.net`)는 세션 쿠키 기반으로 동작하며, 만료 시 자동으로 재로그인합니다.  
관리자 API 경로와 인증 정보는 `DLS_ADMIN_*` 환경 변수로 설정합니다.