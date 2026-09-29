import type { Project, ProjectId } from "@/core/domain/entities/Project";
import type { ProjectRepository } from "@/core/domain/repositories/ProjectRepository";
import type { Workspace } from "@/core/domain/entities/Workspace";
import { projects } from "@/infrastructure/data/projects";
import { currentWorkspace } from "@/infrastructure/data/workspace";

export class InMemoryProjectRepository implements ProjectRepository {
  async findById(id: ProjectId): Promise<Project | null> {
    return projects.find((project) => project.id === id) ?? null;
  }

  async findAll(): Promise<Project[]> {
    return projects;
  }

  async findWorkspace(): Promise<Workspace | null> {
    return currentWorkspace;
  }

  async save(project: Project): Promise<void> {
    const index = projects.findIndex((item) => item.id === project.id);
    if (index >= 0) projects[index] = project;
    else projects.push(project);
  }
}
