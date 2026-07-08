import { RowDataPacket } from "../db/types";

export type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password_hash: string;
};
