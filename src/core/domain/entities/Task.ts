import type { Attachment } from "./Attachment";
import type { User } from "./User";

export type Priority = "low" | "medium" | "high";

export type TaskId = string;

export interface Task {
  id: TaskId;
  title: string;
  description: string;
  priority: Priority;
  assignee: User;
  assignees?: User[];
  startDate?: string;
  dueDate: string;
  filesCount: number;
  tags: string[];
  highlighted?: boolean;
  attachments?: Attachment[];
}

export function assigneesOf(task: Task): User[] {
  return task.assignees?.length ? task.assignees : [task.assignee];
}
