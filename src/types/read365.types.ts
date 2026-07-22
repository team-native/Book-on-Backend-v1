import { RowDataPacket } from "../db/types";

export type Read365SessionRow = RowDataPacket & {
  userId: number;
  read365Id: string;
  cookieHeader: string;
  memberKey: string | null;
  schoolKey: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionExpiresAt: string;
};
