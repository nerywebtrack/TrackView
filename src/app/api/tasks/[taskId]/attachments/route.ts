import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatSupabaseError } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { TASK_ATTACHMENTS_BUCKET, sanitizeFileName } from "@/lib/supabase/storage";

type RouteContext = { params: Promise<{ taskId: string }> };
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { taskId } = await params;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (authError || !userId) return NextResponse.json({ error: "Debes iniciar sesión para adjuntar archivos" }, { status: 401 });

  const projectId = await findProjectIdForTask(supabase, taskId);
  if (!projectId) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const path = `${projectId}/${taskId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
  });
  if (uploadError) return NextResponse.json({ error: formatSupabaseError(uploadError) }, { status: 400 });

  const { data: row, error: insertError } = await supabase
    .from("task_attachments")
    .insert({ task_id: taskId, file_name: file.name, storage_path: path, content_type: file.type || null, size_bytes: file.size, uploaded_by: userId })
    .select("id,task_id,file_name,storage_path,content_type,size_bytes,created_at")
    .single();
  if (insertError) {
    await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([path]);
    return NextResponse.json({ error: formatSupabaseError(insertError) }, { status: 400 });
  }

  const { data: signed } = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({
    id: row.id,
    taskId: row.task_id,
    name: row.file_name,
    path: row.storage_path,
    contentType: row.content_type ?? undefined,
    size: row.size_bytes,
    createdAt: row.created_at,
    url: signed?.signedUrl ?? "",
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { taskId } = await params;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData?.claims?.sub) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });

  const attachmentId = new URL(request.url).searchParams.get("attachmentId");
  if (!attachmentId) return NextResponse.json({ error: "Falta attachmentId" }, { status: 400 });

  const { data: attachment, error: fetchError } = await supabase
    .from("task_attachments")
    .select("id,task_id,storage_path")
    .eq("id", attachmentId)
    .eq("task_id", taskId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: formatSupabaseError(fetchError) }, { status: 400 });
  if (!attachment) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  const { error: deleteRowError } = await supabase.from("task_attachments").delete().eq("id", attachmentId);
  if (deleteRowError) return NextResponse.json({ error: formatSupabaseError(deleteRowError) }, { status: 400 });

  await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
  return NextResponse.json({ ok: true });
}

async function findProjectIdForTask(supabase: SupabaseServerClient, taskId: string): Promise<string | null> {
  const { data: task } = await supabase.from("tasks").select("column_id").eq("id", taskId).maybeSingle();
  if (!task) return null;
  const { data: column } = await supabase.from("board_columns").select("project_id").eq("id", task.column_id).maybeSingle();
  return column?.project_id ?? null;
}
