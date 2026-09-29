import type { Task } from "./Task";

export type ColumnId = string;

export interface BoardColumn {
  id: ColumnId;
  name: string;
  totalCount: number;
  tasks: Task[];
}
