import { NextResponse } from "next/server";
import type { ProjectReport, ReportColumn, ReportEvent, ReportPerson, ReportPeriod, ReportTask } from "@/core/application/dto/ProjectReport";
import type { ColumnKind } from "@/core/domain/entities/BoardColumn";
import type { Priority } from "@/core/domain/entities/Task";
import type { TaskActivityAction } from "@/core/domain/entities/TaskActivity";
import { SupabaseProjectRepository } from "@/infrastructure/repositories/SupabaseProjectRepository";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatSupabaseError } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ projectId: string }> };
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type TaskRow = { id: string; column_id: string; title: string; description: string; priority: Priority; start_date: string | null; due_date: string | null; tags: string[] | null; created_at: string; assignee_id: string | null };
type ActivityRow = { id: number; task_id: string; task_title: string | null; actor_id: string | null; action: TaskActivityAction; field: string | null; old_value: unknown; new_value: unknown; from_column_name: string | null; to_column_name: string | null; to_column_kind: ColumnKind | null; assignees: Array<{ id?: string; name?: string }> | null; created_at: string };
type PeriodRow = { task_id: string; column_id: string; column_name: string | null; column_kind: ColumnKind | null; entered_at: string; left_at: string | null };
type ProfileLite = { id: string; display_name: string; email: string | null };

const PAGE_SIZE = 1000;

export async function GET(_: Request, { params }: RouteContext) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Los reportes requieren Supabase" }, { status: 503 });
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const authUserId = authData?.claims?.sub;
  if (authError || !authUserId) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });

  try {
    const repository = new SupabaseProjectRepository(supabase);
    const team = await repository.findTeam(projectId);
    if (!team) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const { data: me } = await supabase.from("profiles").select("id").eq("auth_user_id", authUserId).maybeSingle();
    if (!me || team.manager?.id !== me.id) {
      return NextResponse.json({ error: "Solo el dueño del proyecto puede ver los reportes" }, { status: 403 });
    }

    const [{ data: project }, { data: columnData, error: columnError }] = await Promise.all([
      supabase.from("projects").select("id,name").eq("id", projectId).single(),
      supabase.from("board_columns").select("id,name,kind,position").eq("project_id", projectId).order("position"),
    ]);
    if (columnError) throw columnError;
    const columns = (columnData ?? []) as ReportColumn[];
    const columnIds = columns.map((column) => column.id);

    const [taskRows, events, periodRows] = await Promise.all([
      columnIds.length ? fetchAll<TaskRow>(supabase, "tasks", "id,column_id,title,description,priority,start_date,due_date,tags,created_at,assignee_id", (query) => query.in("column_id", columnIds)) : Promise.resolve([]),
      fetchAll<ActivityRow>(supabase, "task_activity", "id,task_id,task_title,actor_id,action,field,old_value,new_value,from_column_name,to_column_name,to_column_kind,assignees,created_at", (query) => query.eq("project_id", projectId).order("created_at").order("id")),
      fetchAll<PeriodRow>(supabase, "task_status_periods", "task_id,column_id,column_name,column_kind,entered_at,left_at", (query) => query.eq("project_id", projectId).order("entered_at")),
    ]);

    const taskIds = taskRows.map((task) => task.id);
    const [assigneeRows, commentRows, attachmentRows] = taskIds.length
      ? await Promise.all([
          fetchAll<{ task_id: string; profile_id: string; position: number }>(supabase, "task_assignees", "task_id,profile_id,position", (query) => query.in("task_id", taskIds).order("position")),
          fetchAll<{ task_id: string }>(supabase, "task_comments", "task_id", (query) => query.in("task_id", taskIds)),
          fetchAll<{ task_id: string }>(supabase, "task_attachments", "task_id", (query) => query.in("task_id", taskIds)),
        ])
      : [[], [], []];

    const profileIds = new Set<string>();
    taskRows.forEach((task) => task.assignee_id && profileIds.add(task.assignee_id));
    assigneeRows.forEach((row) => profileIds.add(row.profile_id));
    events.forEach((event) => event.actor_id && profileIds.add(event.actor_id));
    const { data: profileData } = profileIds.size
      ? await supabase.from("profiles").select("id,display_name,email").in("id", [...profileIds])
      : { data: [] };
    const people = new Map(((profileData ?? []) as ProfileLite[]).map((profile) => [profile.id, toPerson(profile)]));

    const columnsById = new Map(columns.map((column) => [column.id, column]));
    const now = Date.now();
    const periods: ReportPeriod[] = periodRows.map((row) => ({
      taskId: row.task_id,
      columnId: row.column_id,
      columnName: row.column_name ?? columnsById.get(row.column_id)?.name ?? "Estado eliminado",
      columnKind: row.column_kind,
      enteredAt: row.entered_at,
      leftAt: row.left_at,
      seconds: Math.max(0, Math.round(((row.left_at ? Date.parse(row.left_at) : now) - Date.parse(row.entered_at)) / 1000)),
    }));

    const eventsByTask = groupBy(events, (event) => event.task_id);
    const periodsByTask = groupBy(periods, (period) => period.taskId);
    const assigneesByTask = groupBy(assigneeRows, (row) => row.task_id);
    const countBy = (rows: Array<{ task_id: string }>) => rows.reduce((map, row) => map.set(row.task_id, (map.get(row.task_id) ?? 0) + 1), new Map<string, number>());
    const comments = countBy(commentRows);
    const attachments = countBy(attachmentRows);

    const tasks: ReportTask[] = taskRows.map((row) => {
      const history = eventsByTask.get(row.id) ?? [];
      const created = history.find((event) => event.action === "created");
      const taskPeriods = periodsByTask.get(row.id) ?? [];
      const status = columnsById.get(row.column_id) ?? null;
      const assignees = (assigneesByTask.get(row.id) ?? []).flatMap((item) => people.get(item.profile_id) ?? []);
      if (!assignees.length && row.assignee_id && people.has(row.assignee_id)) assignees.push(people.get(row.assignee_id)!);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        tags: row.tags ?? [],
        status,
        deleted: false,
        deletedAt: null,
        createdAt: created?.created_at ?? row.created_at,
        createdBy: created?.actor_id ? people.get(created.actor_id) ?? null : null,
        startDate: row.start_date,
        dueDate: row.due_date,
        startedAt: taskPeriods.find((period) => period.columnKind === "active")?.enteredAt ?? null,
        completedAt: status?.kind === "done" ? [...taskPeriods].reverse().find((period) => period.columnKind === "done")?.enteredAt ?? null : null,
        assignees,
        commentsCount: comments.get(row.id) ?? 0,
        attachmentsCount: attachments.get(row.id) ?? 0,
      };
    });

    // Tasks that no longer exist are rebuilt from the snapshots in their history.
    const liveIds = new Set(taskIds);
    for (const [taskId, history] of eventsByTask) {
      if (liveIds.has(taskId)) continue;
      const created = history.find((event) => event.action === "created");
      const deleted = [...history].reverse().find((event) => event.action === "deleted");
      const last = history[history.length - 1];
      const taskPeriods = periodsByTask.get(taskId) ?? [];
      const snapshot = deletedAssignees(history, deleted);
      tasks.push({
        id: taskId,
        title: last.task_title ?? "(sin nombre)",
        description: "",
        priority: null,
        tags: [],
        status: null,
        deleted: true,
        deletedAt: deleted?.created_at ?? null,
        createdAt: created?.created_at ?? null,
        createdBy: created?.actor_id ? people.get(created.actor_id) ?? null : null,
        startDate: null,
        dueDate: null,
        startedAt: taskPeriods.find((period) => period.columnKind === "active")?.enteredAt ?? null,
        completedAt: [...taskPeriods].reverse().find((period) => period.columnKind === "done")?.enteredAt ?? null,
        assignees: snapshot.flatMap((person) => (person.id ? [{ id: person.id, name: person.name ?? person.id }] : [])),
        commentsCount: 0,
        attachmentsCount: 0,
      });
    }

    const report: ProjectReport = {
      generatedAt: new Date(now).toISOString(),
      project: { id: projectId, name: (project as { name: string } | null)?.name ?? projectId },
      columns,
      members: team.members.map((member) => ({ id: member.id, name: member.name, email: member.email })),
      tasks,
      periods,
      events: events.map((event): ReportEvent => ({
        id: event.id,
        taskId: event.task_id,
        taskTitle: event.task_title ?? "",
        action: event.action,
        field: event.field,
        oldValue: event.old_value,
        newValue: event.new_value,
        fromColumnName: event.from_column_name,
        toColumnName: event.to_column_name,
        actor: event.actor_id ? people.get(event.actor_id) ?? null : null,
        createdAt: event.created_at,
      })),
    };
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: formatSupabaseError(error) }, { status: 500 });
  }
}

type Query = ReturnType<ReturnType<SupabaseServerClient["from"]>["select"]>;

async function fetchAll<T>(supabase: SupabaseServerClient, table: string, columns: string, build: (query: Query) => Query): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(supabase.from(table).select(columns)).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const bucket = map.get(key(item));
    if (bucket) bucket.push(item);
    else map.set(key(item), [item]);
  });
  return map;
}

function toPerson(profile: ProfileLite): ReportPerson {
  return { id: profile.id, name: profile.display_name, email: profile.email ?? undefined };
}

// Older "deleted" events were logged after the cascade removed the assignees,
// so fall back to the latest non-empty snapshot, then to add/remove events.
function deletedAssignees(history: ActivityRow[], deleted: ActivityRow | undefined) {
  if (deleted?.assignees?.length) return deleted.assignees;
  const snapshot = [...history].reverse().find((event) => event.assignees?.length)?.assignees;
  if (snapshot?.length) return snapshot;
  const people = new Map<string, { id: string; name?: string }>();
  history.forEach((event) => {
    const person = event.new_value as { id?: string; name?: string } | null;
    if (!person?.id) return;
    if (event.action === "assignee_added") people.set(person.id, { id: person.id, name: person.name });
    if (event.action === "assignee_removed") people.delete(person.id);
  });
  return [...people.values()];
}
