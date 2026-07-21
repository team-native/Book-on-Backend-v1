# Book-on-Backend-v1 Full API

## 공통 규칙

- Base URL: 서버 실행 환경 기준. 기본 포트는 `PORT` 미설정 시 `3000`.
- Content-Type: JSON body가 있는 요청은 `Content-Type: application/json`.
- 인증 헤더: 인증 필요 API는 `Authorization: Bearer <accessToken>`.
- Status codes 테이블의 `message`는 실제 응답 JSON의 `message`에 담기는 값이다.
- 성공 응답 envelope:

```json
{
  "errorCode": 0,
  "message": "성공 메시지",
  "data": {}
}
```

- 오류 응답 envelope:

```json
{
  "errorCode": 4001,
  "message": "오류 메시지",
  "data": null
}
```

- 공통 오류:

| HTTP status | errorCode | 발생 조건 | 오류 반례 |
|---:|---:|---|---|
| 400 | 4000 | JSON body 문법 오류 | `{ "email": "a@gsm.hs.kr", }` |
| 401 | 4010 | 인증 헤더 없음, 형식 오류, 만료/위조 토큰 | `Authorization` 없음 또는 `Bearer invalid` |
| 404 | 4040 | 등록되지 않은 path | `GET /unknown` |
| 500 | 5000 | 처리되지 않은 서버 내부 오류 | DB/런타임 예외 |

## GET /life

서버 상태 확인 API.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | no message (`{ "status": "ok" }`) |

Example response:

```json
{
  "status": "ok"
}
```

오류 반례: 일반적으로 없음. 존재하지 않는 path는 `4040` 공통 오류를 반환한다.

## POST /auth/register

회원가입.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 201 | 회원가입 성공 |
| 409 | 이미 사용 중인 이메일입니다. |
| 422 | 필수 입력값을 모두 입력해 주세요. / 올바른 이메일을 입력해 주세요. / 학교 이메일(@gsm.hs.kr)만 사용할 수 있습니다. / 비밀번호는 영문과 특수문자(!@#$%^&?~)만 사용하여 6~15자로 입력해야 합니다. / 비밀번호 확인이 일치하지 않습니다. / 성별 값이 올바르지 않습니다. |

Request body:

```json
{
  "email": "string",
  "name": "string",
  "department": "string",
  "gender": "string",
  "password": "string",
  "passwordConfirm": "string"
}
```

Example request body:

```json
{
  "email": "student@gsm.hs.kr",
  "name": "홍길동",
  "department": "소프트웨어개발과",
  "gender": "MALE",
  "password": "abc!123",
  "passwordConfirm": "abc!123"
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "회원가입 성공",
  "data": {
    "userId": 1,
    "email": "student@gsm.hs.kr",
    "name": "홍길동"
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 422 | 4220 | 필수값 누락 | `{ "email": "" }` |
| 422 | 4220 | 이메일 형식 오류 | `{ "email": "abc" }` |
| 422 | 4220 | `@gsm.hs.kr` 도메인 아님 | `{ "email": "a@gmail.com" }` |
| 422 | 4220 | `gender`가 `MALE`, `FEMALE` 아님 | `{ "gender": "OTHER" }` |
| 422 | 4221 | 비밀번호 규칙 오류 | `{ "password": "abcdef" }` |
| 422 | 4221 | 비밀번호 확인 불일치 | `{ "password": "abc!123", "passwordConfirm": "abc!124" }` |
| 409 | 4091 | 이미 사용 중인 이메일 | 동일 이메일 재가입 |

## POST /auth/login

서비스 계정 로그인.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | 로그인 성공 |
| 401 | 아이디 또는 비밀번호가 올바르지 않습니다. |
| 422 | 아이디와 비밀번호를 모두 입력해 주세요. |

Request body:

```json
{
  "loginId": "string",
  "password": "string"
}
```

Example request body:

```json
{
  "loginId": "student@gsm.hs.kr",
  "password": "abc!123"
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "로그인 성공",
  "data": {
    "userId": 1,
    "name": "홍길동",
    "email": "student@gsm.hs.kr",
    "accessToken": "jwt.access.token",
    "refreshToken": "refresh-token",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 422 | 4222 | 아이디/비밀번호 누락 | `{ "loginId": "" }` |
| 401 | 4011 | 계정 없음 또는 비밀번호 불일치 | `{ "loginId": "none@gsm.hs.kr", "password": "wrong!1" }` |

## POST /auth/refresh

Access token 재발급 API. 유효한 refresh token을 전달하면 기존 refresh token을 폐기하고 새 access token과 refresh token을 발급한다.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | Token refreshed successfully. |
| 401 | Invalid or expired refresh token. |
| 422 | refreshToken is required. |

Request body:

```json
{
  "refreshToken": "string"
}
```

Example request body:

```json
{
  "refreshToken": "refresh-token"
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "Token refreshed successfully.",
  "data": {
    "accessToken": "jwt.access.token",
    "refreshToken": "new-refresh-token",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 422 | 4222 | refreshToken 누락 | `{ "refreshToken": "" }` |
| 401 | 4010 | refreshToken 없음/만료/폐기됨 | `{ "refreshToken": "invalid" }` |

## POST /auth/read365/login

read365 개인 계정 로그인 후 세션 저장.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | read365 개인 계정 로그인에 성공했습니다. |
| 401 | 로그인이 필요합니다. / read365 아이디 또는 비밀번호가 올바르지 않습니다. |
| 422 | read365 아이디와 비밀번호를 모두 입력해 주세요. |
| 502 | read365 응답을 해석하지 못했습니다. / read365 로그인 서버에 연결하지 못했습니다. / read365 초기 페이지를 불러오지 못했습니다. / read365 세션 쿠키를 받지 못했습니다. |

Request body:

```json
{
  "id": "string",
  "password": "string"
}
```

Example request body:

```json
{
  "id": "read365-id",
  "password": "read365-password"
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "read365 개인 계정 로그인에 성공했습니다.",
  "data": {
    "read365Id": "read365-id",
    "cookie": "JSESSIONID=...",
    "sessionExpiresAt": "2026-07-20T15:00:00.000Z",
    "profile": {
      "memberKey": "123",
      "schKey": "456"
    },
    "jsessionId": "..."
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 401 | 4010 | 서비스 JWT 없음/만료 | `Authorization` 없음 |
| 422 | 4222 | read365 id/password 누락 | `{ "id": "" }` |
| 401 | 4013 | read365 계정 정보 불일치 | 잘못된 read365 비밀번호 |
| 502 | 5023 | read365 로그인 서버 연결/응답 오류 | read365 장애 또는 응답 파싱 실패 |

## POST /auth/password-reset/email

비밀번호 재설정 인증 메일 발송.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | 비밀번호 재설정 인증 메일을 발송했습니다. |
| 404 | 가입된 이메일을 찾을 수 없습니다. |
| 422 | 올바른 이메일을 입력해 주세요. |

Request body:

```json
{
  "email": "string"
}
```

Example request body:

```json
{
  "email": "student@gsm.hs.kr"
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "비밀번호 재설정 인증 메일을 발송했습니다.",
  "data": {
    "email": "student@gsm.hs.kr",
    "expiresIn": 300
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 422 | 4220 | 이메일 형식 오류 | `{ "email": "abc" }` |
| 404 | 4041 | 가입된 이메일 없음 | `{ "email": "none@gsm.hs.kr" }` |

## PATCH /auth/password-reset

인증 코드로 비밀번호 변경.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | 비밀번호가 변경되었습니다. |
| 401 | 인증 코드가 올바르지 않거나 만료되었습니다. |
| 422 | 필수 입력값을 모두 입력해 주세요. / 비밀번호는 영문과 특수문자(!@#$%^&?~)만 사용하여 6~15자로 입력해야 합니다. / 비밀번호 확인이 일치하지 않습니다. |

Request body:

```json
{
  "email": "string",
  "verificationCode": "string",
  "newPassword": "string",
  "newPasswordConfirm": "string"
}
```

Example request body:

```json
{
  "email": "student@gsm.hs.kr",
  "verificationCode": "123456",
  "newPassword": "new!123",
  "newPasswordConfirm": "new!123"
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "비밀번호가 변경되었습니다.",
  "data": {
    "email": "student@gsm.hs.kr"
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 422 | 4220 | 필수값 누락 | `{ "email": "student@gsm.hs.kr" }` |
| 422 | 4221 | 새 비밀번호 규칙 오류 | `{ "newPassword": "abcdef" }` |
| 422 | 4221 | 새 비밀번호 확인 불일치 | `newPassword !== newPasswordConfirm` |
| 401 | 4012 | 인증 코드 불일치/만료/사용됨 | `{ "verificationCode": "000000" }` |

## GET /books

학교 도서 목록 조회. DLS 프록시 검색 결과를 동기화/가공한다.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| query params | `page` 기본 1, `size` 기본 20 최대 100, `sort` 기본 `POPULAR` 허용 `POPULAR`, `NEW`, `category` 선택 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 도서 목록 조회 성공 |
| 400 | 정렬 값이 올바르지 않습니다. / 도서 카테고리가 올바르지 않습니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /books?page=1&size=20&sort=POPULAR
```

Example response:

```json
{
  "errorCode": 0,
  "message": "도서 목록 조회 성공",
  "data": {
    "items": [
      {
        "bookId": 123,
        "title": "클린 코드",
        "author": "Robert C. Martin",
        "publisher": "인사이트",
        "category": "학교도서관",
        "libraryNumber": "005.1-마888ㅋ",
        "coverImageUrl": "https://...",
        "totalQuantity": 1,
        "availableQuantity": 1,
        "loanAvailable": true,
        "status": "대출가능",
        "isbn": "9788966260959",
        "registeredAt": "2026-01-01"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 20,
      "totalCount": 50,
      "totalPages": 3,
      "hasNext": true
    }
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `page`, `size`가 양의 정수 아님 또는 최대 초과 | `/books?page=0`, `/books?size=101` |
| 400 | 4001 | `sort` 값 오류 | `/books?sort=OLD` |
| 400 | 4001 | `category`를 DLS 카테고리로 해석 불가 | `/books?category=UNKNOWN` |
| 502 | 5021 | DLS 프록시 연결/응답 오류 | DLS 프록시 서버 다운 |

## GET /books/search

도서 제목 또는 도서관 번호 검색.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| query params | `keyword` 선택, `libraryNumber` 선택, `page` 기본 1, `size` 기본 20 최대 100 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 도서 검색 성공 |
| 400 | undefined |
| 422 | 책 제목 또는 도서관 번호 중 하나 이상을 입력해 주세요. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /books/search?keyword=typescript&page=1&size=10
```

Example response:

```json
{
  "errorCode": 0,
  "message": "도서 검색 성공",
  "data": {
    "items": [
      {
        "bookId": 1001,
        "title": "타입스크립트",
        "author": "저자",
        "publisher": "출판사",
        "category": "학교도서관",
        "libraryNumber": "005.1",
        "coverImageUrl": null,
        "totalQuantity": 1,
        "availableQuantity": 1,
        "loanAvailable": true,
        "status": "대출가능",
        "isbn": null,
        "registeredAt": "2026-01-01"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 10,
      "totalCount": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 422 | 4223 | `keyword`, `libraryNumber` 둘 다 없음 | `/books/search` |
| 400 | 4001 | 페이지 값 오류 | `/books/search?keyword=a&page=-1` |
| 502 | 5021 | DLS 프록시 오류 | DLS 응답 status가 `SUCCESS/WARNING` 아님 |

## GET /books/categories

학교 도서 카테고리 조회.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 도서 카테고리 목록 조회 성공 |

Example response:

```json
{
  "errorCode": 0,
  "message": "도서 카테고리 목록 조회 성공",
  "data": {
    "items": [
      {
        "categoryId": 1,
        "code": "0",
        "name": "총류",
        "bookCount": 0
      }
    ]
  }
}
```

오류 반례: 현재 구현상 직접 검증 오류 없음.

## GET /books/new

신간 도서 목록 조회.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| query params | `page` 기본 1, `size` 기본 20 최대 100 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 신간 도서 목록 조회 성공 |
| 400 | undefined |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "신간 도서 목록 조회 성공",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "size": 20,
      "totalCount": 0,
      "totalPages": 0,
      "hasNext": false
    }
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | 페이지 값 오류 | `/books/new?size=0` |
| 502 | 5021 | DLS 프록시 오류 | DLS 프록시 서버 연결 실패 |

## GET /books/recommendations/today

오늘의 추천 도서 조회.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 오늘의 책 추천 조회 성공 |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "오늘의 책 추천 조회 성공",
  "data": {
    "recommendedAt": "2026-07-20",
    "items": [
      {
        "bookId": 123,
        "title": "추천 도서",
        "author": "저자",
        "publisher": "출판사",
        "category": "학교도서관",
        "libraryNumber": "001",
        "coverImageUrl": null,
        "totalQuantity": 1,
        "availableQuantity": 1,
        "loanAvailable": true,
        "status": "대출가능",
        "isbn": null,
        "registeredAt": "2026-01-01",
        "reason": "학교 도서관 대출 통계를 기반으로 추천"
      }
    ]
  }
}
```

오류 반례: DLS 프록시 연결/응답 실패 시 `502 / 5021`.

## GET /books/:bookId

도서 상세 조회. 인증 헤더가 있으면 관심 도서 여부도 반환한다.

| 항목 | 값 |
|---|---|
| 인증 | 선택 |
| path params | `bookId`: 양의 정수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> (선택) |

Status codes:

| code | message |
|---:|---|
| 200 | 도서 상세 조회 성공 |
| 400 | 도서 ID가 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |
| 404 | 도서를 찾을 수 없습니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "도서 상세 조회 성공",
  "data": {
    "bookId": 123,
    "title": "클린 코드",
    "author": "Robert C. Martin",
    "publisher": "인사이트",
    "category": "학교도서관",
    "libraryNumber": "005.1",
    "coverImageUrl": "https://...",
    "totalQuantity": 1,
    "availableQuantity": 1,
    "loanAvailable": true,
    "status": "대출가능",
    "isbn": "9788966260959",
    "registeredAt": "2026-01-01",
    "description": null,
    "favorite": false,
    "locationName": "자료실",
    "returnPlanDate": null
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `bookId`가 양의 정수 아님 | `/books/abc` |
| 401 | 4010 | 선택 인증 헤더가 잘못됨 | `Authorization: Bearer invalid` |
| 404 | 4042 | DLS 연동 도서 레코드 없음 또는 상세 없음 | `/books/999999` |
| 502 | 5021 | DLS 프록시 오류 | DLS 프록시 서버 다운 |

## POST /books/:bookId/favorite

관심 도서 등록.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| path params | `bookId`: 양의 정수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 201 | 관심 도서로 등록되었습니다. |
| 400 | 도서 ID가 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |
| 404 | 도서를 찾을 수 없습니다. |
| 409 | 이미 관심 도서로 등록된 책입니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "관심 도서로 등록되었습니다.",
  "data": {
    "bookId": 123,
    "favorite": true
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `bookId` 오류 | `/books/0/favorite` |
| 401 | 4010 | 인증 없음 | 헤더 없음 |
| 404 | 4042 | 도서 없음 | `/books/999999/favorite` |
| 409 | 4096 | 이미 관심 도서로 등록됨 | 같은 도서를 두 번 등록 |

## DELETE /books/:bookId/favorite

관심 도서 해제.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| path params | `bookId`: 양의 정수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | 관심 도서 등록이 해제되었습니다. |
| 400 | 도서 ID가 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "관심 도서 등록이 해제되었습니다.",
  "data": {
    "bookId": 123,
    "favorite": false
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `bookId` 오류 | `/books/abc/favorite` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |

## POST /loans

도서 대출 신청.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | 대출 신청이 완료되었습니다. |
| 400 | 도서 ID가 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |
| 404 | 도서를 찾을 수 없습니다. |
| 409 | 현재 대출 가능한 재고가 없습니다. / 이미 대출 중인 도서입니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Request body:

```json
{
  "bookId": "int"
}
```

Example request body:

```json
{
  "bookId": 123
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "대출 신청이 완료되었습니다.",
  "data": {
    "loanId": 10,
    "bookId": 123,
    "borrowedAt": "2026-07-20",
    "dueDate": "2026-08-03",
    "status": "BORROWED",
    "title": "클린 코드"
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `bookId`가 양의 정수 아님 | `{ "bookId": "abc" }` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 404 | 4042 | 도서 없음 | `{ "bookId": 999999 }` |
| 409 | 4092 | 대출 가능 재고 없음 | 이미 모두 대출 중 |
| 409 | 4093 | 사용자가 이미 같은 도서를 대출 중 | 같은 책 재대출 |
| 502 | 5021 | DLS 상세 상태 확인 실패 | DLS 프록시 서버 장애 |

## POST /loans/:loanId/extension

서비스 내부 대출 기간 연장.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| path params | `loanId`: 양의 정수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | 대출 기간이 연장되었습니다. |
| 400 | 대출 ID가 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |
| 404 | 대출 정보를 찾을 수 없습니다. |
| 409 | 이미 연장한 대출입니다. / 연체 중인 도서는 연장할 수 없습니다. / 현재 대출 중인 도서만 연장할 수 있습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "대출 기간이 연장되었습니다.",
  "data": {
    "loanId": 10,
    "previousDueDate": "2026-08-03",
    "newDueDate": "2026-08-10",
    "extensionCount": 1,
    "extensionAvailable": false
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `loanId` 오류 | `/loans/abc/extension` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 404 | 4043 | 내 대출 정보가 아님 또는 없음 | `/loans/999999/extension` |
| 409 | 4094 | 이미 연장한 대출 | 동일 대출 재연장 |
| 409 | 4095 | 연체/반납 등 연장 불가 상태 | `status=OVERDUE` |

## GET /me

내 프로필, 대출 요약, 현재 대출, 알림 설정 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | 마이페이지 조회 성공 |
| 401 | 인증이 필요합니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "마이페이지 조회 성공",
  "data": {
    "user": {
      "userId": 1,
      "email": "student@gsm.hs.kr",
      "name": "홍길동",
      "department": "소프트웨어개발과",
      "gender": "MALE"
    },
    "loanSummary": {
      "currentLoanCount": 1,
      "overdueCount": 0,
      "nearestDueDate": "2026-08-03",
      "nearestDueDday": 14
    },
    "currentLoans": [
      {
        "loanId": 10,
        "bookId": 123,
        "title": "클린 코드",
        "dueDate": "2026-08-03",
        "dDay": 14,
        "extensionAvailable": true
      }
    ],
    "notificationSettings": {
      "dueDateReminder": true,
      "newBookReminder": false
    }
  }
}
```

오류 반례: 인증 없음/만료/위조 토큰은 `401 / 4010`.

## GET /me/loans/current

내 현재 대출 목록 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | 현재 대출 목록 조회 성공 |
| 401 | 인증이 필요합니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "현재 대출 목록 조회 성공",
  "data": {
    "items": [
      {
        "loanId": 10,
        "bookId": 123,
        "title": "클린 코드",
        "author": "Robert C. Martin",
        "borrowedAt": "2026-07-20",
        "dueDate": "2026-08-03",
        "dDay": 14,
        "extensionAvailable": true,
        "status": "BORROWED"
      }
    ]
  }
}
```

오류 반례: 인증 없음/오류는 `401 / 4010`.

## GET /me/loans/history

내 대출 히스토리 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `page` 기본 1, `size` 기본 20 최대 100, `status` 기본 `ALL` 허용 `ALL`, `RETURNED`, `OVERDUE`, `BORROWED` |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | 대출 히스토리 조회 성공 |
| 400 | 대출 상태 값이 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "대출 히스토리 조회 성공",
  "data": {
    "items": [
      {
        "loanId": 10,
        "bookId": 123,
        "title": "클린 코드",
        "borrowedAt": "2026-07-20",
        "dueDate": "2026-08-03",
        "returnedAt": null,
        "status": "BORROWED"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 20,
      "totalCount": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | 페이지 값 오류 | `/me/loans/history?page=0` |
| 400 | 4001 | `status` 값 오류 | `/me/loans/history?status=LOST` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |

## GET /me/favorite-books

내 관심 도서 목록 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `page` 기본 1, `size` 기본 20 최대 100 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | 관심 도서 목록 조회 성공 |
| 400 | undefined |
| 401 | 인증이 필요합니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "관심 도서 목록 조회 성공",
  "data": {
    "items": [
      {
        "bookId": 123,
        "title": "클린 코드",
        "author": "Robert C. Martin",
        "libraryNumber": "005.1",
        "availableQuantity": 1,
        "loanAvailable": true,
        "favoritedAt": "2026-07-20 10:00:00"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 20,
      "totalCount": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | 페이지 값 오류 | `/me/favorite-books?size=101` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |

## PATCH /me/notification-settings

내 알림 설정 변경.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |
| Content-Type | application/json |

Status codes:

| code | message |
|---:|---|
| 200 | 알림 설정이 변경되었습니다. |
| 400 | 변경할 알림 설정을 입력해 주세요. / 알림 설정 값이 올바르지 않습니다. |
| 401 | 인증이 필요합니다. |

Request body:

```json
{
  "dueDateReminder": "boolean",
  "newBookReminder": "boolean"
}
```

Example request body:

```json
{
  "dueDateReminder": true,
  "newBookReminder": false
}
```

Example response:

```json
{
  "errorCode": 0,
  "message": "알림 설정이 변경되었습니다.",
  "data": {
    "dueDateReminder": true,
    "newBookReminder": false
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | 변경할 필드 없음 | `{}` |
| 400 | 4001 | boolean이 아닌 값 | `{ "dueDateReminder": "true" }` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |

## GET /marathon

read365 독서마라톤 진행 정보 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | read365 마라톤 정보를 조회했습니다. |
| 401 | 로그인이 필요합니다. / read365 세션이 없습니다. 다시 로그인해 주세요. / read365 세션이 만료되었습니다. 다시 로그인해 주세요. / read365 세션 정보가 불완전합니다. 다시 로그인해 주세요. / read365 세션이 유효하지 않습니다. 다시 로그인해 주세요. |
| 502 | read365 마라톤 서버에 연결하지 못했습니다. / read365 마라톤 응답을 해석하지 못했습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "read365 마라톤 정보를 조회했습니다.",
  "data": {
    "read365Id": "read365-id",
    "memberKey": "123",
    "schoolKey": "456",
    "activeCount": 1,
    "marathons": [
      {
        "readingMarathonKey": "789",
        "contestName": "독서마라톤",
        "contestSummary": null,
        "contestStartDate": "2026-03-01",
        "contestEndDate": "2026-12-31",
        "progressStatusCode": "02",
        "progressStatusName": "진행중",
        "myJoinYN": "Y",
        "myFinishYN": "N",
        "myJoinDate": "2026-03-02",
        "myTotalPage": 120,
        "totalJoinCount": 100,
        "finishYJoinCount": 10,
        "finishNJoinCount": 90,
        "deadLineDays": 164,
        "course": {},
        "progressBooks": [
          {
            "certainBookKey": "1",
            "bookKey": "2",
            "titleInfo": "책 제목",
            "author": "저자",
            "publisher": "출판사",
            "coverUrl": null,
            "page": 300,
            "myTotalPage": 120,
            "statusCodeList": null,
            "statusNameList": null,
            "dailyLogs": []
          }
        ]
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 401 | 4010 | 서비스 인증 없음/오류 | 헤더 없음 |
| 401 | 4014 | read365 세션 없음/만료/불완전/무효 | `/auth/read365/login` 전 호출 |
| 502 | 5024 | read365 마라톤 서버 연결/응답 오류 | read365 API 장애 |

## GET /marathon/read365/myinfo

read365 내 정보 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | read365 내 정보를 조회했습니다. |
| 401 | 로그인이 필요합니다. / read365 세션이 없습니다. 다시 로그인해 주세요. / read365 세션이 만료되었습니다. 다시 로그인해 주세요. / read365 세션 정보가 불완전합니다. 다시 로그인해 주세요. / read365 세션이 유효하지 않습니다. 다시 로그인해 주세요. |
| 502 | read365 마라톤 서버에 연결하지 못했습니다. / read365 마라톤 응답을 해석하지 못했습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "read365 내 정보를 조회했습니다.",
  "data": {
    "read365Id": "read365-id",
    "memberKey": "123",
    "schoolKey": "456",
    "profile": {
      "id": "read365-id",
      "name": "홍길동"
    }
  }
}
```

오류 반례: `/marathon`과 동일하게 `4010`, `4014`, `5024`.

## GET /notices

공지사항 목록 조회.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| query params | `page` 기본 1, `size` 기본 10 최대 100 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 공지사항 목록 조회 성공 |
| 400 | undefined |

Example response:

```json
{
  "errorCode": 0,
  "message": "공지사항 목록 조회 성공",
  "data": {
    "items": [
      {
        "noticeId": 1,
        "title": "공지",
        "summary": "요약",
        "createdAt": "2026-07-20 10:00:00"
      }
    ],
    "pagination": {
      "page": 1,
      "size": 10,
      "totalCount": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
}
```

오류 반례: `/notices?page=0`, `/notices?size=101`은 `400 / 4001`.

## GET /rankings/readers

연도별 다독 학생 랭킹 조회.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| query params | `year` 필수, `limit` 필수 최대 100 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 다독 학생 랭킹 조회 성공 |
| 400 | 연도와 조회 개수를 입력해 주세요. / 연도 값이 올바르지 않습니다. |

Example request:

```http
GET /rankings/readers?year=2026&limit=10
```

Example response:

```json
{
  "errorCode": 0,
  "message": "다독 학생 랭킹 조회 성공",
  "data": {
    "year": 2026,
    "resetPolicy": "매년 1월 1일 00:00에 연간 랭킹 초기화",
    "items": [
      {
        "rank": 1,
        "userId": 1,
        "name": "홍길동",
        "department": "소프트웨어개발과",
        "loanCount": 12
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `year` 또는 `limit` 누락 | `/rankings/readers?year=2026` |
| 400 | 4001 | `year` 범위 오류 | `/rankings/readers?year=1999&limit=10` |
| 400 | 4001 | `limit` 양의 정수 아님 또는 100 초과 | `/rankings/readers?year=2026&limit=101` |

## GET /home

메인 화면 데이터 조회.

| 항목 | 값 |
|---|---|
| 인증 | 불필요 |
| query params | `limit` 기본 5 최대 20 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| 없음 | 없음 |

Status codes:

| code | message |
|---:|---|
| 200 | 메인 화면 조회 성공 |
| 400 | undefined |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "메인 화면 조회 성공",
  "data": {
    "banners": [
      {
        "id": 1,
        "title": "배너",
        "contentType": "IMAGE",
        "imageUrl": "https://...",
        "targetUrl": "https://..."
      }
    ],
    "todayRecommendation": {
      "bookId": 123,
      "title": "추천 도서",
      "author": "저자",
      "publisher": "출판사",
      "category": "학교도서관",
      "libraryNumber": "001",
      "coverImageUrl": null,
      "totalQuantity": 1,
      "availableQuantity": 1,
      "loanAvailable": true,
      "status": "대출가능",
      "isbn": null,
      "registeredAt": "2026-01-01",
      "reason": "학교 도서관 대출 통계를 기반으로 추천"
    },
    "menus": [
      {
        "code": "RANKING",
        "name": "랭킹",
        "path": "/ranking"
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `limit` 오류 | `/home?limit=21` |
| 502 | 5021 | DLS 추천 도서 조회 실패 | DLS 프록시 서버 다운 |

## GET /dls/returnDate

DLS 반납 예정일 정보 조회. `Book-on-DLS-v1`의 `GET /returnDate`를 호출한다.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| params | 없음 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 반납 예정일 조회 성공 |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 반납 예정일 조회 성공",
  "data": {
    "count": 0,
    "bookList": []
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 연결/응답 오류 | `DLS_PROXY_BASE_URL` 서버 미실행 |

## GET /dls/searchStudent

DLS 학생 검색.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `name` 필수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 학생 검색 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/searchStudent?name=홍길동
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 학생 검색 성공",
  "data": {
    "count": 1,
    "studentList": [
      {
        "user_key": "123",
        "user_no": "20260001",
        "name": "홍길동"
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `name` 누락 | `/dls/searchStudent` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 오류 | DLS 프록시가 500 응답 |

## GET /dls/currentLoan

DLS 현재 대출 목록 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `user_key` 필수, `user_no` 필수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 현재 대출 목록 조회 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/currentLoan?user_key=123&user_no=20260001
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 현재 대출 목록 조회 성공",
  "data": {
    "count": 1,
    "bookList": [
      {
        "loan_key": "555",
        "reg_no": "EM000001",
        "title": "도서명",
        "loan_date": "2026-07-20",
        "rtn_plan_date": "2026-08-03"
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `user_key` 누락 | `/dls/currentLoan?user_no=20260001` |
| 400 | 4001 | `user_no` 누락 | `/dls/currentLoan?user_key=123` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 오류 | DLS status가 `ERROR` |

## GET /dls/bookInfo

DLS 등록번호 기반 도서 정보 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `reg_nos` 필수. 여러 값은 DLS 프록시가 받는 문자열 그대로 전달 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 도서 정보 조회 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/bookInfo?reg_nos=EM000001
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 도서 정보 조회 성공",
  "data": {
    "count": 1,
    "bookList": [
      {
        "reg_no": "EM000001",
        "title": "도서명",
        "aut_nm": "저자",
        "publisher": "출판사",
        "pblcn_yr": "2026",
        "cover_img_path": "https://...",
        "ea_isbn": "978...",
        "call_no": "005.1",
        "location_desc": "자료실",
        "status_desc": "대출가능",
        "rtn_plan_date": ""
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `reg_nos` 누락 | `/dls/bookInfo` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 오류 | DLS 프록시 서버 다운 |

## GET /dls/loanHistory

DLS 대출 이력 조회.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `user_key` 필수, `start_date` 선택, `end_date` 선택. 날짜 형식은 DLSClient 기준 `YYYY-MM-DD` |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 대출 이력 조회 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/loanHistory?user_key=123&start_date=2026-03-01&end_date=2026-07-20
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 대출 이력 조회 성공",
  "data": {
    "count": 1,
    "bookList": [
      {
        "reg_no": "EM000001",
        "title": "도서명",
        "loan_date": "2026-07-01",
        "return_date": "2026-07-10"
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `user_key` 누락 | `/dls/loanHistory` |
| 502 | 5021 | DLS 프록시가 날짜 형식 오류 등으로 500 응답 | `/dls/loanHistory?user_key=123&start_date=20260720` |

## GET /dls/execution

DLS 대출/반납 실행 요청. `Book-on-DLS-v1`은 `reg_no`, `user_key`로 `requestExecution`을 호출한다.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `reg_no` 필수, `user_key` 필수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 대출/반납 실행 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/execution?reg_no=EM000001&user_key=123
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 대출/반납 실행 성공",
  "data": {
    "statusDescription": "SUCCESS"
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `reg_no` 누락 | `/dls/execution?user_key=123` |
| 400 | 4001 | `user_key` 누락 | `/dls/execution?reg_no=EM000001` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 오류 | DLS 세션 미캡처 또는 DLS 실패 |

## GET /dls/searchBook

DLS 원본 도서 검색.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `query` 필수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 도서 검색 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/searchBook?query=typescript
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 도서 검색 성공",
  "data": {
    "count": 1,
    "bookList": [
      {
        "reg_no": "EM000001",
        "title": "타입스크립트",
        "aut_nm": "저자",
        "publisher": "출판사",
        "pblcn_yr": "2026",
        "cover_img_path": null,
        "ea_isbn": "978..."
      }
    ]
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `query` 누락 | `/dls/searchBook` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 오류 | DLS 응답 파싱/상태 오류 |

## GET /dls/extendLoan

DLS 대출 연장.

| 항목 | 값 |
|---|---|
| 인증 | 필요 |
| query params | `user_key` 필수, `loan_key` 필수 |
| request body | 없음 |

Request headers:

| key | value |
|---|---|
| Authorization | Bearer <accessToken> |

Status codes:

| code | message |
|---:|---|
| 200 | DLS 대출 연장 성공 |
| 400 | {key} query parameter is required |
| 401 | 인증이 필요합니다. |
| 502 | 학교 도서관 서버에 연결할 수 없습니다. / 학교 도서관 서버 응답이 올바르지 않습니다. / 학교 도서관 조회에 실패했습니다. / 학교 도서 식별자가 올바르지 않습니다. |

Example request:

```http
GET /dls/extendLoan?user_key=123&loan_key=555
```

Example response:

```json
{
  "errorCode": 0,
  "message": "DLS 대출 연장 성공",
  "data": {
    "statusDescription": "SUCCESS"
  }
}
```

오류 반례:

| HTTP status | errorCode | 조건 | 예시 |
|---:|---:|---|---|
| 400 | 4001 | `user_key` 누락 | `/dls/extendLoan?loan_key=555` |
| 400 | 4001 | `loan_key` 누락 | `/dls/extendLoan?user_key=123` |
| 401 | 4010 | 인증 없음/오류 | 헤더 없음 |
| 502 | 5021 | DLS 프록시 오류 | 연장 실패 또는 DLS 세션 오류 |

## DLS 프록시 참고

`Book-on-Backend-v1`의 `/dls/*`, `/books*`, `/home`, `/books/recommendations/today` 일부는 `DLS_PROXY_BASE_URL`로 설정된 `Book-on-DLS-v1` 서버를 호출한다.

| Backend 호출 | DLS 프록시 호출 | DLSClient 내부 POST |
|---|---|---|
| `GET /dls/returnDate` | `GET /returnDate` | `/getStudentReturnPlanDate.do` |
| `GET /dls/searchStudent?name=` | `GET /searchStudent?name=` | `/loanReturn/keywordSearch.do` |
| `GET /dls/currentLoan?user_key=&user_no=` | `GET /currentLoan?user_key=&user_no=` | `/loanReturn/getCurrentLoanList.do` |
| `GET /dls/bookInfo?reg_nos=` | `GET /bookInfo?reg_nos=` | `/loanReturn/getBookInfo.do` |
| `GET /dls/loanHistory?user_key=&start_date=&end_date=` | `GET /loanHistory?...` | `/loanReturn/getLoanHist.do` |
| `GET /dls/execution?reg_no=&user_key=` | `GET /execution?...` | `/loanReturn/keywordSearch.do` |
| `GET /dls/searchBook?query=` | `GET /searchBook?query=` | `/bookMng/getSearchBook.do` |
| `GET /dls/extendLoan?user_key=&loan_key=` | `GET /extendLoan?...` | `/loanReturn/updateExtendMultiLoan.do` |

백엔드에서 DLS 프록시 응답은 `status`가 `SUCCESS` 또는 `WARNING`일 때만 성공으로 취급한다. 그 외 상태, HTTP 실패, 연결 실패는 `502 / 5021`로 변환된다.
