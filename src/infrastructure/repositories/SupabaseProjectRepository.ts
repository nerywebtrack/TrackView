import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "@/core/domain/entities/Attachment";
import type { BoardColumn, ColumnKind } from "@/core/domain/entities/BoardColumn";
import type { Project, ProjectId, ProjectVisibility } from "@/core/domain/entities/Project";
import type { Priority, Task } from "@/core/domain/entities/Task";
import type { User } from "@/core/domain/entities/User";
import type { Workspace } from "@/core/domain/entities/Workspace";
import type { ProjectRepository } from "@/core/domain/repositories/ProjectRepository";
import { TASK_ATTACHMENTS_BUCKET } from "@/lib/supabase/storage";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const PROFILE_FIELDS = "id,auth_user_id,display_name,initials,color,email,avatar_url";

type ProjectRow = { id: string; workspace_id: string; name: string; subtitle: string; visibility: ProjectVisibility };
type ColumnRow = { id: string; project_id: string; name: string; position: number; kind: ColumnKind };
export type ProfileRow = { id: string; auth_user_id?: string | null; display_name: string; initials: string; color: string; email?: string | null; avatar_url?: string | null };
type TaskRow = { id: string; column_id: string; title: string; description: string; priority: Priority; assignee_id: string | null; start_date: string | null; due_date: string; files_count: number; tags: string[]; highlighted: boolean; position: number };
type AttachmentRow = { id: string; task_id: string; kind: "file" | "link"; file_name: string; storage_path: string | null; url: string | null; content_type: string | null; size_bytes: number; created_at: string };

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: ProjectId): Promise<Project | null> {
    const { data: projectData, error: projectError } = await this.client.from("projects").select("id,workspace_id,name,subtitle,visibility").eq("id", id).maybeSingle();
    if (projectError) throw projectError;
    if (!projectData) return null;
    const projectRow = projectData as ProjectRow;

    const [{ data: columnData, error: columnError }, team] = await Promise.all([
      this.client.from("board_columns").select("id,project_id,name,position,kind").eq("project_id", id).order("position"),
      this.loadTeam(projectRow),
    ]);
    if (columnError) throw columnError;

    const columns = (columnData ?? []) as ColumnRow[];
    const columnIds = columns.map((column) => column.id);
    const { data: taskData, error: taskError } = columnIds.length
      ? await this.client.from("tasks").select(`id,column_id,title,description,priority,assignee_id,start_date,due_date,files_count,tags,highlighted,position,assignee:profiles!tasks_assignee_id_fkey(${PROFILE_FIELDS})`).in("column_id", columnIds).order("position")
      : { data: [], error: null };
    if (taskError) throw taskError;

    const tasks = (taskData ?? []) as unknown as Array<TaskRow & { assignee: ProfileRow | null }>;
    const taskIds = tasks.map((task) => task.id);
    const [attachmentsByTask, assigneesByTask] = taskIds.length
      ? await Promise.all([this.loadAttachments(taskIds), this.loadAssignees(taskIds)])
      : [new Map<string, Attachment[]>(), new Map<string, User[]>()];

    return {
      id: projectRow.id,
      name: projectRow.name,
      subtitle: projectRow.subtitle,
      visibility: projectRow.visibility,
      members: team.members,
      manager: team.manager,
      extraMembers: 0,
      columns: columns.map((column): BoardColumn => {
        const columnTasks = tasks.filter((task) => task.column_id === column.id).map((task) => mapTask(task, attachmentsByTask.get(task.id) ?? [], assigneesByTask.get(task.id) ?? []));
        return { id: column.id, name: column.name, kind: column.kind, totalCount: columnTasks.length, tasks: columnTasks };
      }),
    };
  }

  async findTeam(projectId: ProjectId): Promise<{ workspaceId: string; members: User[]; manager?: User } | null> {
    const { data, error } = await this.client.from("projects").select("id,workspace_id,name,subtitle,visibility").eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const project = data as ProjectRow;
    return { workspaceId: project.workspace_id, ...(await this.loadTeam(project)) };
  }

  // Only the workspace owner can read this list (RLS); everyone else gets [].
  async findRemovedMembers(workspaceId: string): Promise<User[]> {
    const { data: removed, error } = await this.client.from("workspace_removed_users").select("user_id").eq("workspace_id", workspaceId);
    if (error) throw error;
    const ids = ((removed ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
    if (!ids.length) return [];
    const { data: profiles, error: profileError } = await this.client.from("profiles").select(PROFILE_FIELDS).in("auth_user_id", ids);
    if (profileError) throw profileError;
    return ((profiles ?? []) as ProfileRow[]).map(mapUser);
  }

  // The team is the set of people who actually signed in and joined the
  // workspace (workspace_members), not the seeded demo project_members.
  private async loadTeam(project: ProjectRow): Promise<{ members: User[]; manager?: User }> {
    const [{ data: workspace }, { data: memberships }] = await Promise.all([
      this.client.from("workspaces").select("owner_id").eq("id", project.workspace_id).maybeSingle(),
      this.client.from("workspace_members").select("user_id,role").eq("workspace_id", project.workspace_id),
    ]);

    const roleByUser = new Map<string, "owner" | "member">(
      ((memberships ?? []) as Array<{ user_id: string; role: "owner" | "member" }>).map((row) => [row.user_id, row.role]),
    );
    const ownerId = (workspace as { owner_id: string | null } | null)?.owner_id ?? null;
    if (ownerId) roleByUser.set(ownerId, "owner");

    const authIds = [...roleByUser.keys()];
    if (!authIds.length) return { members: await this.loadLegacyMembers(project.id) };

    const { data: profiles, error } = await this.client.from("profiles").select(PROFILE_FIELDS).in("auth_user_id", authIds);
    if (error) throw error;

    const members = ((profiles ?? []) as ProfileRow[])
      .map((profile) => ({ ...mapUser(profile), role: roleByUser.get(profile.auth_user_id ?? "") }))
      .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name)));
    return { members, manager: members.find((member) => member.role === "owner") };
  }

  private async loadLegacyMembers(projectId: string): Promise<User[]> {
    const { data, error } = await this.client.from("project_members").select(`profile:profiles(${PROFILE_FIELDS})`).eq("project_id", projectId);
    if (error) throw error;
    return (data ?? []).flatMap((row) => {
      const profile = (row as unknown as { profile: ProfileRow | null }).profile;
      return profile ? [mapUser(profile)] : [];
    });
  }

  private async loadAssignees(taskIds: string[]): Promise<Map<string, User[]>> {
    const { data, error } = await this.client
      .from("task_assignees")
      .select(`task_id,position,profile:profiles(${PROFILE_FIELDS})`)
      .in("task_id", taskIds)
      .order("position");
    if (error) throw error;
    const byTask = new Map<string, User[]>();
    ((data ?? []) as unknown as Array<{ task_id: string; profile: ProfileRow | null }>).forEach((row) => {
      if (!row.profile) return;
      byTask.set(row.task_id, [...(byTask.get(row.task_id) ?? []), mapUser(row.profile)]);
    });
    return byTask;
  }

  private async loadAttachments(taskIds: string[]): Promise<Map<string, Attachment[]>> {
    const { data, error } = await this.client
      .from("task_attachments")
      .select("id,task_id,kind,file_name,storage_path,url,content_type,size_bytes,created_at")
      .in("task_id", taskIds)
      .order("created_at");
    if (error) throw error;

    const rows = (data ?? []) as AttachmentRow[];
    const paths = rows.flatMap((row) => (row.kind === "file" && row.storage_path ? [row.storage_path] : []));
    const urlByPath = new Map<string, string>();
    if (paths.length) {
      const { data: signedUrls, error: signError } = await this.client.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (signError) throw signError;
      (signedUrls ?? []).forEach((item) => {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      });
    }

    const byTask = new Map<string, Attachment[]>();
    rows.forEach((row) => {
      const list = byTask.get(row.task_id) ?? [];
      list.push(mapAttachment(row, row.kind === "file" ? urlByPath.get(row.storage_path ?? "") ?? "" : row.url ?? ""));
      byTask.set(row.task_id, list);
    });
    return byTask;
  }

  async findAll(): Promise<Project[]> {
    const { data, error } = await this.client.from("projects").select("id");
    if (error) throw error;
    const projects = await Promise.all((data ?? []).map((row) => this.findById(row.id)));
    return projects.filter((project): project is Project => project !== null);
  }

  // RLS only lets workspace members read the row; others get null.
  async findWorkspace(projectId: ProjectId): Promise<Workspace | null> {
    const { data: project, error } = await this.client.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!project) return null;
    const { data, error: workspaceError } = await this.client.from("workspaces").select("id,name,label,initial").eq("id", project.workspace_id).maybeSingle();
    if (workspaceError) throw workspaceError;
    return (data as Workspace | null) ?? null;
  }

  async save(project: Project): Promise<void> {
    const { error } = await this.client.rpc("save_project_state", { p_project: project });
    if (error) throw error;
  }
}

export function mapUser(profile: ProfileRow): User {
  return { id: profile.id, name: profile.display_name, initials: profile.initials, color: profile.color, email: profile.email ?? undefined, avatarUrl: profile.avatar_url ?? undefined };
}

export function mapAttachment(row: AttachmentRow, url: string): Attachment {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    name: row.file_name,
    path: row.storage_path ?? "",
    url,
    contentType: row.content_type ?? undefined,
    size: row.size_bytes,
    createdAt: row.created_at,
  };
}

function mapTask(row: TaskRow & { assignee: ProfileRow | null }, attachments: Attachment[], assignees: User[]): Task {
  const primary = row.assignee ? mapUser(row.assignee) : assignees[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    assignee: primary ?? { id: "unassigned", name: "Unassigned", initials: "?", color: "#94a3b8" },
    assignees: assignees.length ? assignees : primary ? [primary] : [],
    startDate: row.start_date ?? undefined,
    dueDate: row.due_date,
    filesCount: row.files_count,
    tags: row.tags ?? [],
    highlighted: row.highlighted,
    attachments,
  };
}
