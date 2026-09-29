import type { Task } from "./Task";

export type ColumnId = string;

export type ColumnKind = "todo" | "active" | "done";

export interface BoardColumn {
  id: ColumnId;
  name: string;
  kind?: ColumnKind;
  totalCount: number;
  tasks: Task[];
}

export function columnKindOf(column: Pick<BoardColumn, "kind" | "name">): ColumnKind {
  if (column.kind) return column.kind;
  const name = column.name.trim().toLowerCase();
  if (name === "done") return "done";
  if (name === "backlog" || name === "to do") return "todo";
  return "active";
}
