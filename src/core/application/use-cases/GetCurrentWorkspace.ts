import type { Workspace } from "@/core/domain/entities/Workspace";
import type { WorkspaceRepository } from "@/core/domain/repositories/WorkspaceRepository";

export class GetCurrentWorkspace {
  constructor(private readonly workspaces: WorkspaceRepository) {}

  execute(): Promise<Workspace> {
    return this.workspaces.findCurrent();
  }
}
