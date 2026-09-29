import { container } from "@/infrastructure/di/container";
import { GetProjectBoard } from "@/core/application/use-cases/GetProjectBoard";
import { createProjectRepository } from "@/infrastructure/repositories/createProjectRepository";
import BoardWorkspace from "@/presentation/views/BoardWorkspace";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { syncAuthenticatedProfile } from "@/lib/supabase/profile";

export default async function BoardScreen({
  projectId,
}: {
  projectId: string;
}) {
  const projectRepository = await createProjectRepository();
  let isAuthenticated = !isSupabaseConfigured();
  let authenticatedUser = null;
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    authenticatedUser = await syncAuthenticatedProfile(await createClient());
    isAuthenticated = Boolean(authenticatedUser);
  }
  const [{ project }, interactions, workspace, currentUser] =
    await Promise.all([
      new GetProjectBoard(projectRepository).execute(projectId),
      container.getRecentInteractions.execute(),
      container.getCurrentWorkspace.execute(),
      container.getCurrentUser.execute(),
    ]);

  const visibleProject = authenticatedUser && !project.members.some((member) => member.id === authenticatedUser.id)
    ? { ...project, members: [...project.members, authenticatedUser] }
    : project;
  return <BoardWorkspace initialProject={visibleProject} interactions={interactions} workspace={workspace} currentUser={authenticatedUser ?? currentUser} isAuthenticated={isAuthenticated} />;
}
