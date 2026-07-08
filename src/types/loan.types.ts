import { RowDataPacket } from "../db/types";

export type LoanRow = RowDataPacket & {
  id: number;
  user_id: number;
  due_date: string;
  status: "BORROWED" | "RETURNED" | "OVERDUE";
  extension_count: number;
};
