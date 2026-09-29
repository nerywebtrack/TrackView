import type { BoardColumn } from "./BoardColumn";
import type { User } from "./User";

export type ProjectId = string;

export type ProjectVisibility = "public" | "private";

export interface Project {
  id: ProjectId;
  name: string;
  subtitle: string;
  visibility: ProjectVisibility;
  members: User[];
  extraMembers: number;
  columns: BoardColumn[];
}
