import { NextResponse } from "next/server";
import { SupabaseProjectRepository } from "@/infrastructure/repositories/SupabaseProjectRepository";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatSupabaseError } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ projectId: string }> };
type MemberAction = "remove" | "restore" | "transfer";

const RPC_BY_ACTION: Record<MemberAction, { fn: string; arg: string }> = {
  remove: { fn: "remove_workspace_member", arg: "member_id" },
  restore: { fn: "restore_workspace_member", arg: "member_id" },
  transfer: { fn: "transfer_workspace_ownership", arg: "new_owner_id" },
};

export async function GET(_: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { projectId } = await params;
  const supabase = await createClient();
  const repository = new SupabaseProjectRepository(supabase);
  try {
    const team = await repository.findTeam(projectId);
    if (!team) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const removed = await repository.findRemovedMembers(team.workspaceId);
    return NextResponse.json({ members: team.members, manager: team.manager ?? null, removed });
  } catch (error) {
    return NextResponse.json({ error: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData?.claims?.sub) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });

  const { action, userId } = (await request.json()) as { action?: MemberAction; userId?: string };
  const rpc = action ? RPC_BY_ACTION[action] : undefined;
  if (!rpc || !userId) return NextResponse.json({ error: "Acción no válida" }, { status: 400 });

  const repository = new SupabaseProjectRepository(supabase);
  try {
    const team = await repository.findTeam(projectId);
    if (!team) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const { error } = await supabase.rpc(rpc.fn, { target_workspace_id: team.workspaceId, [rpc.arg]: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });

    const updated = await repository.findTeam(projectId);
    const removed = await repository.findRemovedMembers(team.workspaceId);
    return NextResponse.json({ members: updated?.members ?? [], manager: updated?.manager ?? null, removed });
  } catch (error) {
    return NextResponse.json({ error: formatSupabaseError(error) }, { status: 500 });
  }
}
