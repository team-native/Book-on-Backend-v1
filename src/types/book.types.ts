import { RowDataPacket } from "mysql2";

export type BookRow = RowDataPacket & {
  bookId: number;
  loanAvailable: number;
  favorite?: number;
};
