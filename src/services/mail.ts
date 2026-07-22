import nodemailer from "nodemailer";
import { env } from "../config/env";
import { ApiError } from "../lib/api";

const hasSmtpConfig = Boolean(env.smtp.host && env.smtp.user && env.smtp.password && env.smtp.from);

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: env.smtp.host as string,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user as string,
        pass: env.smtp.password as string,
      },
    })
  : null;

const requireTransporter = () => {
  if (!transporter) {
    throw new ApiError(500, 5001, "메일 서버 설정이 필요합니다.");
  }
  return transporter;
};

export const sendPasswordResetCode = async (email: string, code: string) => {
  await requireTransporter().sendMail({
    from: env.smtp.from as string,
    to: email,
    subject: "Book-on 비밀번호 재설정 인증 코드",
    text: `인증 코드는 ${code}입니다. 5분 안에 입력해 주세요.`,
  });
};

export const sendRegisterVerificationCode = async (email: string, code: string) => {
  await requireTransporter().sendMail({
    from: env.smtp.from as string,
    to: email,
    subject: "Book-on 회원가입 인증 코드",
    text: `회원가입 인증 코드는 ${code}입니다. 5분 안에 입력해 주세요.`,
  });
};
