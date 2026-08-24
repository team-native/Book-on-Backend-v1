import sb from "sql-bricks";
import { env } from "../config/env";

type Q = { sql: string; values: unknown[] };

const toQ = (stmt: { toParams(opts?: { placeholder?: string }): { text: string; values: unknown[] } }): Q => {
  const { text, values } = stmt.toParams({ placeholder: "?" });
  return { sql: text, values };
};

// Auth

export const authQueries = {
  findUserIdByEmail: (email: string): Q =>
    toQ(sb.select("id").from("users").where({ email })),

  findUserForLogin: (email: string): Q =>
    toQ(sb.select("id, email, name, password_hash").from("users").where({ email })),

  insertUser: (
    email: string,
    name: string,
    department: string,
    gender: string,
    passwordHash: string
  ): Q =>
    toQ(
      sb.insertInto("users").values({
        email,
        name,
        department,
        gender,
        password_hash: passwordHash,
      })
    ),

  insertRefreshToken: (userId: number, tokenHash: string, expiresAt: Date): Q =>
    toQ(
      sb.insertInto("refresh_tokens").values({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      })
    ),

  deletePendingRegisterVerificationSessionsByEmail: (email: string): Q => ({
    sql: "DELETE FROM register_verification_sessions WHERE email = ? AND used_at IS NULL",
    values: [email],
  }),

  insertRegisterVerificationSession: (
    sessionId: string,
    email: string,
    name: string,
    department: string,
    gender: string,
    passwordHash: string,
    codeHash: string
  ): Q => ({
    sql: `
      INSERT INTO register_verification_sessions (
        session_id, email, name, department, gender, password_hash, code_hash, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+5 minutes'))
    `,
    values: [sessionId, email, name, department, gender, passwordHash, codeHash],
  }),

  deleteRegisterVerificationSession: (sessionId: string): Q => ({
    sql: "DELETE FROM register_verification_sessions WHERE session_id = ? AND used_at IS NULL",
    values: [sessionId],
  }),

  findValidRegisterVerificationSession: (sessionId: string, codeHash: string): Q => ({
    sql: `
      SELECT
        id,
        session_id AS sessionId,
        email,
        name,
        department,
        gender,
        password_hash AS passwordHash,
        expires_at AS expiresAt
      FROM register_verification_sessions
      WHERE session_id = ?
        AND code_hash = ?
        AND used_at IS NULL
        AND expires_at >= datetime('now')
      LIMIT 1
    `,
    values: [sessionId, codeHash],
  }),

  markRegisterVerificationSessionUsed: (id: number): Q => ({
    sql: "UPDATE register_verification_sessions SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
    values: [id],
  }),

  findRefreshToken: (tokenHash: string): Q => ({
    sql: `
      SELECT
        id,
        user_id AS userId,
        expires_at AS expiresAt
      FROM refresh_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `,
    values: [tokenHash],
  }),

  findActiveSession: (userId: number, sessionId: number): Q => ({
    sql: `
      SELECT
        id,
        expires_at AS expiresAt
      FROM refresh_tokens
      WHERE id = ?
        AND user_id = ?
        AND revoked_at IS NULL
      LIMIT 1
    `,
    values: [sessionId, userId],
  }),

  revokeRefreshToken: (id: number): Q => ({
    sql: "UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?",
    values: [id],
  }),

  findUserByEmailForReset: (email: string): Q =>
    toQ(sb.select("id, email").from("users").where({ email })),

  insertResetCode: (userId: number, codeHash: string): Q => ({
    sql: "INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, datetime('now', '+5 minutes'))",
    values: [userId, codeHash],
  }),

  deleteResetCode: (id: number): Q =>
    toQ(sb.deleteFrom("password_reset_codes").where({ id })),

  findUserByEmailForUpdate: (email: string): Q => ({
    sql: "SELECT id, email FROM users WHERE email = ?",
    values: [email],
  }),

  findValidResetCode: (userId: number, codeHash: string): Q => ({
    sql: "SELECT id FROM password_reset_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL AND expires_at >= datetime('now') ORDER BY id DESC LIMIT 1",
    values: [userId, codeHash],
  }),

  updatePasswordHash: (passwordHash: string, userId: number): Q =>
    toQ(sb.update("users").set({ password_hash: passwordHash }).where({ id: userId })),

  markResetCodeUsed: (id: number): Q => ({
    sql: "UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
    values: [id],
  }),

  revokeRefreshTokens: (userId: number): Q => ({
    sql: "UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?",
    values: [userId],
  }),

  upsertRead365Session: (
    userId: number,
    read365Id: string,
    cookieHeader: string,
    memberKey: string | null,
    schoolKey: string | null,
    accessToken: string | null,
    refreshToken: string | null,
    sessionExpiresAt: string
  ): Q => ({
    sql: `
      INSERT INTO read365_sessions (
        user_id, read365_id, cookie_header, member_key, school_key,
        access_token, refresh_token, session_expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        read365_id = excluded.read365_id,
        cookie_header = excluded.cookie_header,
        member_key = excluded.member_key,
        school_key = excluded.school_key,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        session_expires_at = excluded.session_expires_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    values: [userId, read365Id, cookieHeader, memberKey, schoolKey, accessToken, refreshToken, sessionExpiresAt],
  }),

  findRead365SessionByUserId: (userId: number): Q => ({
    sql: `
      SELECT
        user_id AS userId,
        read365_id AS read365Id,
        cookie_header AS cookieHeader,
        member_key AS memberKey,
        school_key AS schoolKey,
        access_token AS accessToken,
        refresh_token AS refreshToken,
        session_expires_at AS sessionExpiresAt
      FROM read365_sessions
      WHERE user_id = ?
      LIMIT 1
    `,
    values: [userId],
  }),

  deleteRead365SessionByUserId: (userId: number): Q => ({
    sql: "DELETE FROM read365_sessions WHERE user_id = ?",
    values: [userId],
  }),
};

// Books

const bookAvailabilityJoin = `
  LEFT JOIN (
    SELECT book_id, COUNT(*) AS loaned_quantity
    FROM loans
    WHERE status IN ('BORROWED', 'OVERDUE')
    GROUP BY book_id
  ) active_loans ON active_loans.book_id = b.id
`;

export const bookQueries = {
  findBookById: (id: number): Q =>
    toQ(sb.select("id").from("books").where({ id })),

  insertFavorite: (userId: number, bookId: number): Q =>
    toQ(sb.insertInto("favorites").values({ user_id: userId, book_id: bookId })),

  deleteFavorite: (userId: number, bookId: number): Q =>
    toQ(sb.deleteFrom("favorites").where({ user_id: userId, book_id: bookId })),

  countFavorites: (userId: number): Q =>
    toQ(sb.select("COUNT(*) AS totalCount").from("favorites").where({ user_id: userId })),

  listFavoriteBooks: (userId: number, limit: number, offset: number): Q => ({
    sql: `
      SELECT
        b.id AS bookId,
        b.title,
        b.author,
        b.library_number AS libraryNumber,
        b.total_quantity - COALESCE(active_loans.loaned_quantity, 0) AS availableQuantity,
        b.total_quantity > COALESCE(active_loans.loaned_quantity, 0) AS loanAvailable,
        f.created_at AS favoritedAt
      FROM favorites f
      JOIN books b ON b.id = f.book_id
      ${bookAvailabilityJoin}
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `,
    values: [userId, limit, offset],
  }),

  findDlsBookLibraryNumber: (id: number): Q => ({
    sql: "SELECT library_number AS libraryNumber FROM books WHERE id = ? AND library_number LIKE 'DLS:%'",
    values: [id],
  }),

  findUserFavorite: (userId: number, bookId: number): Q =>
    toQ(sb.select("1").from("favorites").where({ user_id: userId, book_id: bookId })),

  upsertBook: (
    id: number,
    title: string,
    author: string,
    publisher: string,
    categoryId: number,
    libraryNumber: string,
    description: string | null,
    coverImageUrl: string | null,
    registeredAt: string
  ): Q => ({
    sql: `
      INSERT INTO books (
        id, title, author, publisher,
        category_id, library_number, description, cover_image_url, total_quantity, registered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        author = excluded.author,
        publisher = excluded.publisher,
        description = COALESCE(excluded.description, books.description),
        cover_image_url = COALESCE(NULLIF(excluded.cover_image_url, ''), books.cover_image_url),
        registered_at = excluded.registered_at
    `,
    values: [id, title, author, publisher, categoryId, libraryNumber, description, coverImageUrl, registeredAt],
  }),

  findDlsCategoryId: (): Q => ({
    sql: "SELECT id FROM categories WHERE code = 'IT'",
    values: [],
  }),
};

// Loans

export const loanQueries = {
  markOverdueLoans: (): Q => ({
    sql: "UPDATE loans SET status = 'OVERDUE' WHERE status = 'BORROWED' AND due_date < CURRENT_DATE",
    values: [],
  }),

  markUserOverdueLoans: (userId: number): Q => ({
    sql: "UPDATE loans SET status = 'OVERDUE' WHERE user_id = ? AND status = 'BORROWED' AND due_date < CURRENT_DATE",
    values: [userId],
  }),

  findBookForLoan: (bookId: number): Q => ({
    sql: "SELECT id, title, total_quantity, library_number FROM books WHERE id = ?",
    values: [bookId],
  }),

  findActiveLoanByUserAndBook: (userId: number, bookId: number): Q => ({
    sql: "SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('BORROWED', 'OVERDUE') LIMIT 1",
    values: [userId, bookId],
  }),

  countActiveLoansByBook: (bookId: number): Q => ({
    sql: "SELECT COUNT(*) AS loanedQuantity FROM loans WHERE book_id = ? AND status IN ('BORROWED', 'OVERDUE')",
    values: [bookId],
  }),

  insertLoan: (userId: number, bookId: number): Q => ({
    sql: `INSERT INTO loans (user_id, book_id, borrowed_at, due_date) VALUES (?, ?, date('now', 'localtime'), date('now', 'localtime', '+${env.loanDays} days'))`,
    values: [userId, bookId],
  }),

  findLoanById: (loanId: number): Q =>
    toQ(
      sb
        .select("id AS loanId, book_id AS bookId, borrowed_at AS borrowedAt, due_date AS dueDate, status")
        .from("loans")
        .where({ id: loanId })
    ),

  markSingleLoanOverdue: (loanId: number): Q => ({
    sql: "UPDATE loans SET status = 'OVERDUE' WHERE id = ? AND status = 'BORROWED' AND due_date < CURRENT_DATE",
    values: [loanId],
  }),

  findLoanForExtension: (loanId: number, userId: number): Q => ({
    sql: "SELECT id, user_id, due_date, status, extension_count FROM loans WHERE id = ? AND user_id = ?",
    values: [loanId, userId],
  }),

  extendLoanDueDate: (loanId: number): Q => ({
    sql: `UPDATE loans SET due_date = date(due_date, '+${env.extensionDays} days'), extension_count = extension_count + 1 WHERE id = ?`,
    values: [loanId],
  }),

  findExtendedLoan: (loanId: number): Q =>
    toQ(
      sb.select("due_date AS newDueDate, extension_count AS extensionCount").from("loans").where({ id: loanId })
    ),

  listCurrentLoans: (userId: number): Q => ({
    sql: `
      SELECT
        l.id AS loanId,
        b.id AS bookId,
        b.title,
        b.author,
        l.borrowed_at AS borrowedAt,
        l.due_date AS dueDate,
        CAST(julianday(l.due_date) - julianday(date('now', 'localtime')) AS INTEGER) AS dDay,
        l.extension_count = 0 AND l.status = 'BORROWED' AS extensionAvailable,
        l.status
      FROM loans l
      JOIN books b ON b.id = l.book_id
      WHERE l.user_id = ? AND l.status IN ('BORROWED', 'OVERDUE')
      ORDER BY l.due_date ASC
    `,
    values: [userId],
  }),

  countLoanHistory: (userId: number, status: string): Q =>
    status === "ALL"
      ? toQ(sb.select("COUNT(*) AS totalCount").from("loans l").where({ "l.user_id": userId }))
      : toQ(
          sb
            .select("COUNT(*) AS totalCount")
            .from("loans l")
            .where({ "l.user_id": userId, "l.status": status })
        ),

  listLoanHistory: (userId: number, status: string, limit: number, offset: number): Q => {
    const base = `
      SELECT
        l.id AS loanId,
        b.id AS bookId,
        b.title,
        l.borrowed_at AS borrowedAt,
        l.due_date AS dueDate,
        l.returned_at AS returnedAt,
        l.status
      FROM loans l
      JOIN books b ON b.id = l.book_id
    `;
    if (status === "ALL") {
      return {
        sql: `${base} WHERE l.user_id = ? ORDER BY l.borrowed_at DESC, l.id DESC LIMIT ? OFFSET ?`,
        values: [userId, limit, offset],
      };
    }
    return {
      sql: `${base} WHERE l.user_id = ? AND l.status = ? ORDER BY l.borrowed_at DESC, l.id DESC LIMIT ? OFFSET ?`,
      values: [userId, status, limit, offset],
    };
  },
};

// Me

export const meQueries = {
  findUserProfile: (userId: number): Q =>
    toQ(
      sb
        .select(
          "id AS userId, email, name, department, gender, due_date_reminder AS dueDateReminder, new_book_reminder AS newBookReminder, notice_reminder AS noticeReminder"
        )
        .from("users")
        .where({ id: userId })
    ),

  getLoanSummary: (userId: number): Q => ({
    sql: `
      SELECT
        COUNT(*) AS currentLoanCount,
        COALESCE(SUM(status = 'OVERDUE'), 0) AS overdueCount,
        MIN(due_date) AS nearestDueDate,
        CAST(julianday(MIN(due_date)) - julianday(date('now', 'localtime')) AS INTEGER) AS nearestDueDday
      FROM loans
      WHERE user_id = ? AND status IN ('BORROWED', 'OVERDUE')
    `,
    values: [userId],
  }),

  listUserCurrentLoans: (userId: number): Q => ({
    sql: `
      SELECT
        l.id AS loanId,
        b.id AS bookId,
        b.title,
        l.due_date AS dueDate,
        CAST(julianday(l.due_date) - julianday(date('now', 'localtime')) AS INTEGER) AS dDay,
        l.extension_count = 0 AND l.status = 'BORROWED' AS extensionAvailable
      FROM loans l
      JOIN books b ON b.id = l.book_id
      WHERE l.user_id = ? AND l.status IN ('BORROWED', 'OVERDUE')
      ORDER BY l.due_date ASC
    `,
    values: [userId],
  }),

  updateNotificationSettings: (updates: Record<string, unknown>, userId: number): Q =>
    toQ(sb.update("users").set(updates).where({ id: userId })),

  findNotificationSettings: (userId: number): Q =>
    toQ(
      sb
        .select("due_date_reminder AS dueDateReminder, new_book_reminder AS newBookReminder, notice_reminder AS noticeReminder")
        .from("users")
        .where({ id: userId })
    ),
};

// Notifications

export const notificationQueries = {
  upsertFcmToken: (
    userId: number,
    token: string,
    dlsUserKey: string | null,
    platform: string | null,
    deviceId: string | null
  ): Q => ({
    sql: `
      INSERT INTO fcm_tokens (user_id, token, dls_user_key, platform, device_id, disabled_at, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET
        user_id = excluded.user_id,
        dls_user_key = excluded.dls_user_key,
        platform = excluded.platform,
        device_id = excluded.device_id,
        disabled_at = NULL,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    values: [userId, token, dlsUserKey, platform, deviceId],
  }),

  disableFcmToken: (userId: number, token: string): Q => ({
    sql: "UPDATE fcm_tokens SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND token = ?",
    values: [userId, token],
  }),

  disableFcmTokenByToken: (token: string): Q => ({
    sql: "UPDATE fcm_tokens SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE token = ?",
    values: [token],
  }),

  listDueLoanReminderTargets: (daysBefore: 0 | 3): Q => ({
    sql: `
      SELECT
        u.id AS userId,
        t.token,
        CAST(l.id AS TEXT) AS loanId,
        'loan' AS source,
        b.title AS bookTitle,
        l.due_date AS dueDate
      FROM loans l
      JOIN users u ON u.id = l.user_id
      JOIN books b ON b.id = l.book_id
      JOIN fcm_tokens t ON t.user_id = u.id AND t.disabled_at IS NULL
      WHERE u.due_date_reminder = 1
        AND l.status = 'BORROWED'
        AND l.due_date = date('now', 'localtime', ?)
      UNION ALL
      SELECT
        u.id AS userId,
        t.token,
        d.loan_key AS loanId,
        'dls' AS source,
        d.title AS bookTitle,
        CASE
          WHEN d.return_plan_date GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
            THEN substr(d.return_plan_date, 1, 4) || '-' || substr(d.return_plan_date, 5, 2) || '-' || substr(d.return_plan_date, 7, 2)
          ELSE substr(d.return_plan_date, 1, 10)
        END AS dueDate
      FROM dls_current_loans d
      JOIN fcm_tokens t ON t.dls_user_key = d.user_key AND t.disabled_at IS NULL
      JOIN users u ON u.id = t.user_id
      WHERE u.due_date_reminder = 1
        AND d.return_plan_date IS NOT NULL
        AND d.return_plan_date <> ''
        AND CASE
          WHEN d.return_plan_date GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
            THEN substr(d.return_plan_date, 1, 4) || '-' || substr(d.return_plan_date, 5, 2) || '-' || substr(d.return_plan_date, 7, 2)
          ELSE substr(d.return_plan_date, 1, 10)
        END = date('now', 'localtime', ?)
    `,
    values: [daysBefore === 0 ? "+0 days" : "+3 days", daysBefore === 0 ? "+0 days" : "+3 days"],
  }),

  listNoticeNotificationTargets: (noticeId: number): Q => ({
    sql: `
      SELECT
        u.id AS userId,
        t.token
      FROM users u
      JOIN fcm_tokens t ON t.user_id = u.id AND t.disabled_at IS NULL
      WHERE u.notice_reminder = 1
        AND NOT EXISTS (
          SELECT 1
          FROM notification_deliveries d
          WHERE d.user_id = u.id
            AND d.kind = 'NOTICE'
            AND d.reference_type = 'notice'
            AND d.reference_id = CAST(? AS TEXT)
        )
    `,
    values: [noticeId],
  }),

  listPendingNoticeNotifications: (limit: number): Q => ({
    sql: `
      SELECT n.id AS noticeId, n.title, n.summary
      FROM notices n
      WHERE EXISTS (
        SELECT 1
        FROM users u
        JOIN fcm_tokens t ON t.user_id = u.id AND t.disabled_at IS NULL
        WHERE u.notice_reminder = 1
          AND NOT EXISTS (
            SELECT 1
            FROM notification_deliveries d
            WHERE d.user_id = u.id
              AND d.kind = 'NOTICE'
              AND d.reference_type = 'notice'
              AND d.reference_id = CAST(n.id AS TEXT)
          )
      )
      ORDER BY n.created_at ASC, n.id ASC
      LIMIT ?
    `,
    values: [limit],
  }),

  insertNotificationDelivery: (
    userId: number,
    kind: string,
    referenceType: string,
    referenceId: string,
    targetDate: string | null,
    title: string,
    body: string
  ): Q => ({
    sql: `
      INSERT OR IGNORE INTO notification_deliveries (
        user_id, kind, reference_type, reference_id, target_date, title, body
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    values: [userId, kind, referenceType, referenceId, targetDate, title, body],
  }),

  markNotificationDeliverySent: (
    userId: number,
    kind: string,
    referenceType: string,
    referenceId: string,
    targetDate: string | null
  ): Q => ({
    sql: `
      UPDATE notification_deliveries
      SET sent_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND kind = ?
        AND reference_type = ?
        AND reference_id = ?
        AND (
          (target_date IS NULL AND ? IS NULL)
          OR target_date = ?
        )
    `,
    values: [userId, kind, referenceType, referenceId, targetDate, targetDate],
  }),
};

// Public

export const publicQueries = {
  countNotices: (): Q =>
    toQ(sb.select("COUNT(*) AS totalCount").from("notices")),

  listNotices: (limit: number, offset: number): Q => ({
    sql: "SELECT id AS noticeId, title, summary, created_at AS createdAt FROM notices ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
    values: [limit, offset],
  }),

  getReaderRankings: (year: number, limit: number): Q => ({
    sql: `
      SELECT
        u.id AS userId,
        u.email,
        u.name,
        u.department,
        COUNT(l.id) AS loanCount
      FROM users u
      JOIN loans l ON l.user_id = u.id
      WHERE strftime('%Y', l.borrowed_at) = ?
      GROUP BY u.id, u.email
      ORDER BY loanCount DESC, u.id ASC
      LIMIT ?
    `,
    values: [String(year), limit],
  }),

  listBanners: (limit: number): Q => ({
    sql: `
      SELECT
        id,
        title,
        content_type AS contentType,
        image_url AS imageUrl,
        target_url AS targetUrl
      FROM banners
      WHERE active = TRUE
      ORDER BY display_order ASC, id DESC
      LIMIT ?
    `,
    values: [limit],
  }),
};
