import { NextResponse } from "next/server";
import type { Project } from "@/core/domain/entities/Project";
import { createProjectRepository } from "@/infrastructure/repositories/createProjectRepository";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { SupabaseProjectRepository } from "@/infrastructure/repositories/SupabaseProjectRepository";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const { projectId } = await params;
    const project = await (await createProjectRepository()).findById(projectId);
    return project ? NextResponse.json(project) : NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load project" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getClaims();
    if (authError || !authData?.claims?.sub) {
      return NextResponse.json({ error: "Debes iniciar sesión para guardar cambios" }, { status: 401 });
    }
    const { projectId } = await params;
    const project = (await request.json()) as Project;
    if (!project || project.id !== projectId || !Array.isArray(project.columns)) {
      return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
    }
    await new SupabaseProjectRepository(supabase).save(project);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save project" }, { status: 500 });
  }
}
