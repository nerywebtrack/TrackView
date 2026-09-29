import type { Project } from "@/core/domain/entities/Project";
import type { ProjectRepository } from "@/core/domain/repositories/ProjectRepository";

export class ListProjects {
  constructor(private readonly projects: ProjectRepository) {}

  execute(): Promise<Project[]> {
    return this.projects.findAll();
  }
}
