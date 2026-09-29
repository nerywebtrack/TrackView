import type { Workspace } from "../entities/Workspace";

export interface WorkspaceRepository {
  findCurrent(): Promise<Workspace>;
}
