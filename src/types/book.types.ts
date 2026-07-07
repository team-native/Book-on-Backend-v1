import { RowDataPacket } from "../db/types";

export type BookRow = RowDataPacket & {
  bookId: number;
  loanAvailable: number;
  favorite?: number;
};
