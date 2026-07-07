import { RowDataPacket } from "mysql2";

export type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password_hash: string;
};
