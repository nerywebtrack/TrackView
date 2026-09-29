import { GetCurrentUser } from "@/core/application/use-cases/GetCurrentUser";
import { GetCurrentWorkspace } from "@/core/application/use-cases/GetCurrentWorkspace";
import { GetProjectBoard } from "@/core/application/use-cases/GetProjectBoard";
import { GetRecentInteractions } from "@/core/application/use-cases/GetRecentInteractions";
import { ListProjects } from "@/core/application/use-cases/ListProjects";
import { InMemoryInteractionRepository } from "@/infrastructure/repositories/InMemoryInteractionRepository";
import { InMemoryProjectRepository } from "@/infrastructure/repositories/InMemoryProjectRepository";
import { InMemoryUserRepository } from "@/infrastructure/repositories/InMemoryUserRepository";
import { InMemoryWorkspaceRepository } from "@/infrastructure/repositories/InMemoryWorkspaceRepository";

const projectRepository = new InMemoryProjectRepository();
const interactionRepository = new InMemoryInteractionRepository();
const workspaceRepository = new InMemoryWorkspaceRepository();
const userRepository = new InMemoryUserRepository();

export const container = {
  getProjectBoard: new GetProjectBoard(projectRepository),
  listProjects: new ListProjects(projectRepository),
  getRecentInteractions: new GetRecentInteractions(interactionRepository),
  getCurrentWorkspace: new GetCurrentWorkspace(workspaceRepository),
  getCurrentUser: new GetCurrentUser(userRepository),
};
