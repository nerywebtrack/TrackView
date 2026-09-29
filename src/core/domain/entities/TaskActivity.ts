import type { User } from "./User";

export type TaskActivityAction =
  | "created"
  | "status_changed"
  | "updated"
  | "deleted"
  | "assignee_added"
  | "assignee_removed"
  | "comment_added"
  | "attachment_added"
  | "attachment_removed";

export interface TaskActivity {
  id: number;
  taskId: string;
  action: TaskActivityAction;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  fromColumnName: string | null;
  toColumnName: string | null;
  actor: User | null;
  createdAt: string;
}
