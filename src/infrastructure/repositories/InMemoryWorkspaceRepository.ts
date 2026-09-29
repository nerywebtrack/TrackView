import type { Workspace } from "@/core/domain/entities/Workspace";
import type { WorkspaceRepository } from "@/core/domain/repositories/WorkspaceRepository";
import { currentWorkspace } from "@/infrastructure/data/workspace";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  async findCurrent(): Promise<Workspace> {
    return currentWorkspace;
  }
}
