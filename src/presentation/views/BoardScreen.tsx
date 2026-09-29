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
  const [board, workspace, currentUser] =
    await Promise.all([
      new GetProjectBoard(projectRepository).execute(projectId),
      container.getCurrentWorkspace.execute(),
      container.getCurrentUser.execute(),
    ]);

  if (!board) return <ProjectMissing projectId={projectId} />;
  return <BoardWorkspace initialProject={board.project} workspace={workspace} currentUser={authenticatedUser ?? currentUser} isAuthenticated={isAuthenticated} />;
}

function ProjectMissing({ projectId }: { projectId: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e6eafb] p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">Este tablero no existe todavía</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          No se encontró el proyecto <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{projectId}</code>.
          Si la base de datos se reinició, vuelve a cargar los datos iniciales con{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">supabase db query --linked -f supabase/seed.sql</code>.
        </p>
      </section>
    </main>
  );
}
