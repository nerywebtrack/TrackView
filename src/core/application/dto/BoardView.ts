import type { Project } from "@/core/domain/entities/Project";

export interface BoardView {
  project: Project;
  progress: number;
}
