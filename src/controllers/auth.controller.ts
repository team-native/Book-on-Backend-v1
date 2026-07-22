import { randomBytes, randomInt } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../config/env";
import { authQueries } from "../db/queries";
import { pool } from "../db/pool";
import { ResultSetHeader, RowDataPacket } from "../db/types";
import { ApiError, sendSuccess } from "../lib/api";
import { hashPassword, verifyPassword } from "../lib/password";
import { createAccessToken, createRefreshToken, hashToken } from "../lib/token";
import { sendPasswordResetCode, sendRegisterVerificationCode } from "../services/mail";
import { loginRead365Session } from "../services/read365-session";
import { UserRow } from "../types/user.types";

const passwordPattern = /^(?=.*[a-zA-Z])(?=.*[!@#$%^&?~])[a-zA-Z!@#$%^&?~]{6,15}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schoolEmailDomain = "@gsm.hs.kr";
const verificationCodePattern = /^\d{6}$/;

type RegisterVerificationSessionRow = RowDataPacket & {
  id: number;
  sessionId: string;
  email: string;
  name: string;
  department: string;
  gender: string;
  passwordHash: string;
  expiresAt: string;
};

export const register = async (req: Request, res: Response) => {
  const { email, name, department, gender, password, passwordConfirm } = req.body ?? {};
  const fields = { email, name, department, gender, password, passwordConfirm };
  const missing = Object.entries(fields)
    .filter(([, value]) => typeof value !== "string" || value.trim() === "")
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new ApiError(422, 4220, "필수 입력값을 모두 입력해 주세요.", { fields: missing });
  }
  if (!emailPattern.test(email)) {
    throw new ApiError(422, 4220, "올바른 이메일을 입력해 주세요.", { field: "email" });
  }

  const normalizedEmail = email.toLowerCase();
  if (!normalizedEmail.endsWith(schoolEmailDomain)) {
    throw new ApiError(422, 4220, "학교 이메일(@gsm.hs.kr)만 사용할 수 있습니다.", { field: "email" });
  }
  if (!passwordPattern.test(password)) {
    throw new ApiError(
      422,
      4221,
      "비밀번호는 영문과 특수문자(!@#$%^&?~)만 사용하여 6~15자로 입력해야 합니다.",
      { field: "password" }
    );
  }
  if (password !== passwordConfirm) {
    throw new ApiError(422, 4221, "비밀번호 확인이 일치하지 않습니다.", { field: "passwordConfirm" });
  }
  if (!["MALE", "FEMALE"].includes(gender)) {
    throw new ApiError(422, 4220, "성별 값이 올바르지 않습니다.", { field: "gender" });
  }

  const q1 = authQueries.findUserIdByEmail(normalizedEmail);
  const [existing] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);
  if (existing.length > 0) {
    throw new ApiError(409, 4091, "이미 사용 중인 이메일입니다.");
  }

  const sessionId = randomBytes(32).toString("base64url");
  const passcode = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();
  const passwordHash = await hashPassword(password);

  try {
    const q2 = authQueries.deletePendingRegisterVerificationSessionsByEmail(normalizedEmail);
    await pool.query(q2.sql, q2.values);

    const q3 = authQueries.insertRegisterVerificationSession(
      sessionId,
      normalizedEmail,
      name.trim(),
      department.trim(),
      gender,
      passwordHash,
      hashToken(passcode)
    );
    await pool.query(q3.sql, q3.values);

    await sendRegisterVerificationCode(normalizedEmail, passcode);
  } catch (error) {
    const cleanup = authQueries.deleteRegisterVerificationSession(sessionId);
    await pool.query(cleanup.sql, cleanup.values);

    const { code, message } = error as { code?: string; message?: string };
    if (
      code === "ER_DUP_ENTRY" ||
      code?.startsWith("SQLITE_CONSTRAINT") ||
      (code === "ERR_SQLITE_ERROR" && message?.includes("UNIQUE constraint failed"))
    ) {
      throw new ApiError(409, 4091, "이미 사용 중인 이메일입니다.");
    }
    throw error;
  }

  sendSuccess(res, 202, "회원가입 인증 메일을 발송했습니다.", {
    sessionId,
    expiresAt,
    email: normalizedEmail,
  });
};

export const verifyRegister = async (req: Request, res: Response) => {
  const { sessionId, passcode } = req.body ?? {};
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new ApiError(422, 4220, "세션 아이디를 입력해 주세요.", { field: "sessionId" });
  }
  if (typeof passcode !== "string" || !verificationCodePattern.test(passcode)) {
    throw new ApiError(422, 4220, "인증 코드는 6자리 숫자여야 합니다.", { field: "passcode" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const q1 = authQueries.findValidRegisterVerificationSession(sessionId.trim(), hashToken(passcode));
    const [sessions] = await connection.query<RegisterVerificationSessionRow[]>(q1.sql, q1.values);
    const session = sessions[0];
    if (!session) {
      throw new ApiError(401, 4012, "인증 세션이 올바르지 않거나 만료되었습니다.");
    }

    const q2 = authQueries.findUserIdByEmail(session.email);
    const [existing] = await connection.query<RowDataPacket[]>(q2.sql, q2.values);
    if (existing.length > 0) {
      throw new ApiError(409, 4091, "이미 사용 중인 이메일입니다.");
    }

    const q3 = authQueries.insertUser(
      session.email,
      session.name,
      session.department,
      session.gender,
      session.passwordHash
    );
    const [result] = await connection.query<ResultSetHeader>(q3.sql, q3.values);

    const q4 = authQueries.markRegisterVerificationSessionUsed(session.id);
    await connection.query(q4.sql, q4.values);

    await connection.commit();

    sendSuccess(res, 201, "회원가입 성공", {
      userId: result.insertId,
      email: session.email,
      name: session.name,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const login = async (req: Request, res: Response) => {
  const { loginId, password } = req.body ?? {};
  const missing = [
    typeof loginId === "string" && loginId.trim() ? null : "loginId",
    typeof password === "string" && password ? null : "password",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new ApiError(422, 4222, "아이디와 비밀번호를 모두 입력해 주세요.", { fields: missing });
  }

  const q1 = authQueries.findUserForLogin(loginId.toLowerCase());
  const [users] = await pool.query<UserRow[]>(q1.sql, q1.values);
  const user = users[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new ApiError(401, 4011, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  const connection = await pool.getConnection();
  let accessToken: string;
  let refreshToken: string;
  try {
    await connection.beginTransaction();

    const q2 = authQueries.revokeRefreshTokens(user.id);
    await connection.query(q2.sql, q2.values);

    refreshToken = createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + env.refreshTokenExpiresIn * 1000);
    const q3 = authQueries.insertRefreshToken(user.id, hashToken(refreshToken), refreshExpiresAt);
    const [result] = await connection.query<ResultSetHeader>(q3.sql, q3.values);
    accessToken = createAccessToken(user.id, result.insertId);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  sendSuccess(res, 200, "로그인 성공", {
    userId: user.id,
    name: user.name,
    email: user.email,
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: env.accessTokenExpiresIn,
  });
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new ApiError(422, 4222, "refreshToken is required.", { field: "refreshToken" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const q1 = authQueries.findRefreshToken(hashToken(refreshToken));
    const [tokens] = await connection.query<RowDataPacket[]>(q1.sql, q1.values);
    const token = tokens[0];
    if (!token || new Date(token.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(401, 4010, "Invalid or expired refresh token.");
    }

    const q2 = authQueries.revokeRefreshTokens(token.userId);
    await connection.query(q2.sql, q2.values);

    const newRefreshToken = createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + env.refreshTokenExpiresIn * 1000);
    const q3 = authQueries.insertRefreshToken(token.userId, hashToken(newRefreshToken), refreshExpiresAt);
    const [result] = await connection.query<ResultSetHeader>(q3.sql, q3.values);
    const accessToken = createAccessToken(token.userId, result.insertId);

    await connection.commit();

    sendSuccess(res, 200, "Token refreshed successfully.", {
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: env.accessTokenExpiresIn,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const logout = async (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new ApiError(422, 4222, "refreshToken is required.", { field: "refreshToken" });
  }

  const q1 = authQueries.findRefreshToken(hashToken(refreshToken));
  const [tokens] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);
  const token = tokens[0];
  if (!token || new Date(token.expiresAt).getTime() <= Date.now()) {
    throw new ApiError(401, 4010, "Invalid or expired refresh token.");
  }

  const q2 = authQueries.revokeRefreshTokens(token.userId);
  await pool.query(q2.sql, q2.values);

  sendSuccess(res, 200, "Logged out successfully.", null);
};

export const sendResetEmail = async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !emailPattern.test(email)) {
    throw new ApiError(422, 4220, "올바른 이메일을 입력해 주세요.", { field: "email" });
  }

  const normalizedEmail = email.toLowerCase();
  const q1 = authQueries.findUserByEmailForReset(normalizedEmail);
  const [users] = await pool.query<UserRow[]>(q1.sql, q1.values);
  const user = users[0];
  if (!user) {
    throw new ApiError(404, 4041, "가입된 이메일을 찾을 수 없습니다.");
  }

  const code = randomInt(100000, 1000000).toString();
  const q2 = authQueries.insertResetCode(user.id, hashToken(code));
  const [codeResult] = await pool.query<ResultSetHeader>(q2.sql, q2.values);
  try {
    await sendPasswordResetCode(normalizedEmail, code);
  } catch (error) {
    const q3 = authQueries.deleteResetCode(codeResult.insertId);
    await pool.query(q3.sql, q3.values);
    throw error;
  }

  sendSuccess(res, 200, "비밀번호 재설정 인증 메일을 발송했습니다.", {
    email: normalizedEmail,
    expiresIn: 300,
  });
};

export const loginRead365 = async (req: Request, res: Response) => {
  const { id, password } = req.body ?? {};
  if (typeof req.userId !== "number") {
    throw new ApiError(401, 4010, "로그인이 필요합니다.");
  }
  if (typeof id !== "string" || !id.trim() || typeof password !== "string" || !password) {
    throw new ApiError(422, 4222, "read365 아이디와 비밀번호를 모두 입력해 주세요.", {
      fields: ["id", "password"],
    });
  }

  const session = await loginRead365Session(req.userId, id.trim(), password);
  sendSuccess(res, 200, "read365 개인 계정 로그인에 성공했습니다.", session);
};

export const resetPassword = async (req: Request, res: Response) => {
  const { email, verificationCode, newPassword, newPasswordConfirm } = req.body ?? {};
  if (
    [email, verificationCode, newPassword, newPasswordConfirm].some(
      (value) => typeof value !== "string" || value.length === 0
    )
  ) {
    throw new ApiError(422, 4220, "필수 입력값을 모두 입력해 주세요.");
  }
  if (!passwordPattern.test(newPassword)) {
    throw new ApiError(
      422,
      4221,
      "비밀번호는 영문과 특수문자(!@#$%^&?~)만 사용하여 6~15자로 입력해야 합니다.",
      { field: "newPassword" }
    );
  }
  if (newPassword !== newPasswordConfirm) {
    throw new ApiError(422, 4221, "비밀번호 확인이 일치하지 않습니다.", { field: "newPasswordConfirm" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const q1 = authQueries.findUserByEmailForUpdate(email.toLowerCase());
    const [users] = await connection.query<UserRow[]>(q1.sql, q1.values);
    const user = users[0];
    if (!user) {
      throw new ApiError(401, 4012, "인증 코드가 올바르지 않거나 만료되었습니다.");
    }

    const q2 = authQueries.findValidResetCode(user.id, hashToken(verificationCode));
    const [codes] = await connection.query<RowDataPacket[]>(q2.sql, q2.values);
    if (!codes[0]) {
      throw new ApiError(401, 4012, "인증 코드가 올바르지 않거나 만료되었습니다.");
    }

    const q3 = authQueries.updatePasswordHash(await hashPassword(newPassword), user.id);
    await connection.query(q3.sql, q3.values);

    const q4 = authQueries.markResetCodeUsed(codes[0].id);
    await connection.query(q4.sql, q4.values);

    const q5 = authQueries.revokeRefreshTokens(user.id);
    await connection.query(q5.sql, q5.values);

    await connection.commit();

    sendSuccess(res, 200, "비밀번호가 변경되었습니다.", { email: user.email });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
