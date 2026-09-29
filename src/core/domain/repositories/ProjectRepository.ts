import type { Project, ProjectId } from "../entities/Project";

export interface ProjectRepository {
  findById(id: ProjectId): Promise<Project | null>;
  findAll(): Promise<Project[]>;
  save(project: Project): Promise<void>;
}
