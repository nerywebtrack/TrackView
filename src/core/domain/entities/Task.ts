import type { User } from "./User";

export type Priority = "low" | "medium" | "high";

export type TaskId = string;

export interface Task {
  id: TaskId;
  title: string;
  description: string;
  priority: Priority;
  assignee: User;
  dueDate: string;
  filesCount: number;
  tags: string[];
  highlighted?: boolean;
}
