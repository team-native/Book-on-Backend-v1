export type RowDataPacket = Record<string, any>;

export type ResultSetHeader = {
  insertId: number;
  affectedRows: number;
  changedRows: number;
};
