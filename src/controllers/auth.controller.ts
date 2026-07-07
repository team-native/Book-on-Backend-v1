import { randomInt } from "node:crypto";
import { Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { env } from "../config/env";
import { authQueries } from "../db/queries";
import { pool } from "../db/pool";
import { ApiError, sendSuccess } from "../lib/api";
import { hashPassword, verifyPassword } from "../lib/password";
import { createAccessToken, createRefreshToken, hashToken } from "../lib/token";
import { sendPasswordResetCode } from "../services/mail";
import { UserRow } from "../types/user.types";

const passwordPattern = /^(?=.*[a-zA-Z])(?=.*[!@#$%^&?~])[a-zA-Z!@#$%^&?~]{6,15}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schoolEmailDomain = "@gsm.hs.kr";

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
    throw new ApiError(422, 4220, "학교 이메일(@gsm.hs.kr)만 사용할 수 있습니다.", {
      field: "email"
    });
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
    throw new ApiError(422, 4221, "비밀번호 확인이 일치하지 않습니다.", {
      field: "passwordConfirm"
    });
  }
  if (!['MALE', 'FEMALE'].includes(gender)) {
    throw new ApiError(422, 4220, "성별 값이 올바르지 않습니다.", { field: "gender" });
  }

  const q1 = authQueries.findUserIdByEmail(normalizedEmail);
  const [existing] = await pool.query<RowDataPacket[]>(q1.sql, q1.values);
  if (existing.length > 0) {
    throw new ApiError(409, 4091, "이미 사용 중인 이메일입니다.");
  }

  const passwordHash = await hashPassword(password);
  let result: ResultSetHeader;
  try {
    const q2 = authQueries.insertUser(normalizedEmail, name.trim(), department.trim(), gender, passwordHash);
    [result] = await pool.query<ResultSetHeader>(q2.sql, q2.values);
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new ApiError(409, 4091, "이미 사용 중인 이메일입니다.");
    }
    throw error;
  }

  sendSuccess(res, 201, "회원가입 성공", {
    userId: result.insertId,
    email: normalizedEmail,
    name: name.trim()
  });
};

export const login = async (req: Request, res: Response) => {
  const { loginId, password } = req.body ?? {};
  const missing = [
    typeof loginId === "string" && loginId.trim() ? null : "loginId",
    typeof password === "string" && password ? null : "password"
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new ApiError(422, 4222, "아이디와 비밀번호를 모두 입력해 주세요.", {
      fields: missing
    });
  }

  const q1 = authQueries.findUserForLogin(loginId.toLowerCase());
  const [users] = await pool.query<UserRow[]>(q1.sql, q1.values);
  const user = users[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new ApiError(401, 4011, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  const accessToken = createAccessToken(user.id);
  const refreshToken = createRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.refreshTokenExpiresIn * 1000);
  const q2 = authQueries.insertRefreshToken(user.id, hashToken(refreshToken), refreshExpiresAt);
  await pool.query(q2.sql, q2.values);

  sendSuccess(res, 200, "로그인 성공", {
    userId: user.id,
    name: user.name,
    email: user.email,
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: env.accessTokenExpiresIn
  });
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
    expiresIn: 300
  });
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
    throw new ApiError(422, 4221, "비밀번호 확인이 일치하지 않습니다.", {
      field: "newPasswordConfirm"
    });
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
