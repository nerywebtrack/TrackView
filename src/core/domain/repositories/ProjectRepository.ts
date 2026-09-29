import type { Project, ProjectId } from "../entities/Project";
import type { Workspace } from "../entities/Workspace";

export interface ProjectRepository {
  findById(id: ProjectId): Promise<Project | null>;
  findAll(): Promise<Project[]>;
  save(project: Project): Promise<void>;
  findWorkspace(projectId: ProjectId): Promise<Workspace | null>;
}
