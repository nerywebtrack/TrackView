import { NextResponse } from "next/server";
import type { TaskActivity, TaskActivityAction } from "@/core/domain/entities/TaskActivity";
import { mapUser, type ProfileRow } from "@/infrastructure/repositories/SupabaseProjectRepository";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatSupabaseError } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ taskId: string }> };
type ActivityRow = { id: number; task_id: string; actor_id: string | null; action: TaskActivityAction; field: string | null; old_value: unknown; new_value: unknown; from_column_name: string | null; to_column_name: string | null; created_at: string };

export async function GET(_: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { taskId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("task_activity")
    .select("id,task_id,actor_id,action,field,old_value,new_value,from_column_name,to_column_name,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: formatSupabaseError(error) }, { status: 400 });

  const rows = (data ?? []) as ActivityRow[];
  const actorIds = [...new Set(rows.flatMap((row) => (row.actor_id ? [row.actor_id] : [])))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id,auth_user_id,display_name,initials,color,email,avatar_url").in("id", actorIds)
    : { data: [] };
  const actors = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, mapUser(profile)]));

  return NextResponse.json(rows.map((row): TaskActivity => ({
    id: row.id,
    taskId: row.task_id,
    action: row.action,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    fromColumnName: row.from_column_name,
    toColumnName: row.to_column_name,
    actor: row.actor_id ? actors.get(row.actor_id) ?? null : null,
    createdAt: row.created_at,
  })));
}
