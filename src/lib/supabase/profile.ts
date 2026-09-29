import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/core/domain/entities/User";

export async function syncAuthenticatedProfile(client: SupabaseClient): Promise<User | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  const metadata = data.user.user_metadata ?? {};
  const name = String(metadata.full_name ?? metadata.name ?? data.user.email ?? "Usuario");
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
  const avatarUrl = String(metadata.avatar_url ?? metadata.picture ?? "");
  const profile: User = {
    id: data.user.id,
    name,
    initials,
    email: data.user.email ?? undefined,
    avatarUrl: avatarUrl || undefined,
    color: "#6366f1",
  };

  const profilePayload = {
      id: profile.id,
      auth_user_id: profile.id,
      display_name: profile.name,
      initials: profile.initials,
      color: profile.color,
      email: profile.email ?? null,
      avatar_url: profile.avatarUrl ?? null,
  };
  let { error: profileError } = await client.from("profiles").upsert(profilePayload, { onConflict: "id" });
  // Keep OAuth usable while an older remote database is being migrated.
  if (profileError && isMissingProfileColumns(profileError)) {
    const legacyProfile = {
      id: profile.id,
      auth_user_id: profile.id,
      display_name: profile.name,
      initials: profile.initials,
      color: profile.color,
    };
    ({ error: profileError } = await client.from("profiles").upsert(legacyProfile, { onConflict: "id" }));
  }
  if (profileError) throw new Error(formatSupabaseError(profileError));
  return profile;
}

function isMissingProfileColumns(error: unknown) {
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "PGRST204" || candidate.code === "42703" || /email|avatar_url|schema cache/i.test(candidate.message ?? "");
}

export function formatSupabaseError(error: unknown) {
  if (error instanceof Error) return error.message;
  const candidate = error as { message?: string; details?: string; hint?: string; code?: string };
  return [candidate.code, candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" — ") || "Error desconocido de Supabase";
}
