import type { User } from "./User";

export interface TaskComment {
  id: string;
  taskId: string;
  parentId: string | null;
  author: User;
  body: string;
  createdAt: string;
}
