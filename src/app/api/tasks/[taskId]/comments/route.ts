import { NextResponse } from "next/server";
import type { TaskComment } from "@/core/domain/entities/Comment";
import { mapUser, type ProfileRow } from "@/infrastructure/repositories/SupabaseProjectRepository";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatSupabaseError } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ taskId: string }> };
type CommentRow = { id: string; task_id: string; parent_id: string | null; body: string; created_at: string; author: ProfileRow | null };

const COMMENT_FIELDS = "id,task_id,parent_id,body,created_at,author:profiles(id,auth_user_id,display_name,initials,color,email,avatar_url)";

export async function GET(_: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { taskId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_comments").select(COMMENT_FIELDS).eq("task_id", taskId).order("created_at");
  if (error) return NextResponse.json({ error: formatSupabaseError(error) }, { status: 400 });
  return NextResponse.json(((data ?? []) as unknown as CommentRow[]).map(mapComment));
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { taskId } = await params;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (authError || !userId) return NextResponse.json({ error: "Debes iniciar sesión para comentar" }, { status: 401 });

  const { body, parentId } = (await request.json()) as { body?: string; parentId?: string | null };
  const text = body?.trim();
  if (!text) return NextResponse.json({ error: "El comentario está vacío" }, { status: 400 });

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, parent_id: parentId ?? null, author_id: userId, body: text.slice(0, 4000) })
    .select(COMMENT_FIELDS)
    .single();
  if (error) return NextResponse.json({ error: formatSupabaseError(error) }, { status: 400 });
  return NextResponse.json(mapComment(data as unknown as CommentRow));
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { taskId } = await params;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData?.claims?.sub) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });

  const commentId = new URL(request.url).searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "Falta commentId" }, { status: 400 });

  const { data, error } = await supabase.from("task_comments").delete().eq("id", commentId).eq("task_id", taskId).select("id");
  if (error) return NextResponse.json({ error: formatSupabaseError(error) }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Solo puedes eliminar tus propios comentarios" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

function mapComment(row: CommentRow): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    author: row.author ? mapUser(row.author) : { id: "deleted", name: "Usuario eliminado", initials: "?", color: "#94a3b8" },
  };
}
