import type { BoardView } from "@/core/application/dto/BoardView";
import type { ProjectId } from "@/core/domain/entities/Project";
import type { ProjectRepository } from "@/core/domain/repositories/ProjectRepository";
import { calculateProgress } from "@/core/domain/services/ProgressCalculator";

export class GetProjectBoard {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(projectId: ProjectId): Promise<BoardView> {
    const project = await this.projects.findById(projectId);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      project,
      progress: calculateProgress(project),
    };
  }
}
