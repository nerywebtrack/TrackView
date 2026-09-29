import type { ProjectRepository } from "@/core/domain/repositories/ProjectRepository";
import { InMemoryProjectRepository } from "./InMemoryProjectRepository";
import { SupabaseProjectRepository } from "./SupabaseProjectRepository";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function createProjectRepository(): Promise<ProjectRepository> {
  if (!isSupabaseConfigured()) return new InMemoryProjectRepository();
  const { createClient } = await import("@/lib/supabase/server");
  return new SupabaseProjectRepository(await createClient());
}
