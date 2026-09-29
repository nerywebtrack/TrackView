import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardColumn } from "@/core/domain/entities/BoardColumn";
import type { Project, ProjectId, ProjectVisibility } from "@/core/domain/entities/Project";
import type { Priority, Task } from "@/core/domain/entities/Task";
import type { User } from "@/core/domain/entities/User";
import type { ProjectRepository } from "@/core/domain/repositories/ProjectRepository";

type ProjectRow = { id: string; name: string; subtitle: string; visibility: ProjectVisibility };
type ColumnRow = { id: string; project_id: string; name: string; position: number };
type ProfileRow = { id: string; display_name: string; initials: string; color: string; email?: string | null; avatar_url?: string | null };
type TaskRow = { id: string; column_id: string; title: string; description: string; priority: Priority; assignee_id: string | null; due_date: string; files_count: number; tags: string[]; highlighted: boolean; position: number };

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: ProjectId): Promise<Project | null> {
    const { data: projectData, error: projectError } = await this.client.from("projects").select("id,name,subtitle,visibility").eq("id", id).maybeSingle();
    if (projectError) throw projectError;
    if (!projectData) return null;

    const [{ data: columnData, error: columnError }, { data: memberData, error: memberError }] = await Promise.all([
      this.client.from("board_columns").select("id,project_id,name,position").eq("project_id", id).order("position"),
      this.client.from("project_members").select("profile:profiles(id,display_name,initials,color,email,avatar_url)").eq("project_id", id),
    ]);
    if (columnError) throw columnError;
    if (memberError) throw memberError;

    const columns = (columnData ?? []) as ColumnRow[];
    const columnIds = columns.map((column) => column.id);
    const { data: taskData, error: taskError } = columnIds.length
      ? await this.client.from("tasks").select("id,column_id,title,description,priority,assignee_id,due_date,files_count,tags,highlighted,position,assignee:profiles!tasks_assignee_id_fkey(id,display_name,initials,color,email,avatar_url)").in("column_id", columnIds).order("position")
      : { data: [], error: null };
    if (taskError) throw taskError;

    const tasks = (taskData ?? []) as unknown as Array<TaskRow & { assignee: ProfileRow | null }>;
    const members = (memberData ?? []).flatMap((row) => {
      const profile = (row as unknown as { profile: ProfileRow | null }).profile;
      return profile ? [mapUser(profile)] : [];
    });

    return {
      ...(projectData as ProjectRow),
      members,
      extraMembers: 0,
      columns: columns.map((column): BoardColumn => {
        const columnTasks = tasks.filter((task) => task.column_id === column.id).map(mapTask);
        return { id: column.id, name: column.name, totalCount: columnTasks.length, tasks: columnTasks };
      }),
    };
  }

  async findAll(): Promise<Project[]> {
    const { data, error } = await this.client.from("projects").select("id");
    if (error) throw error;
    const projects = await Promise.all((data ?? []).map((row) => this.findById(row.id)));
    return projects.filter((project): project is Project => project !== null);
  }

  async save(project: Project): Promise<void> {
    const { error } = await this.client.rpc("save_project_state", { p_project: project });
    if (error) throw error;
  }
}

function mapUser(profile: ProfileRow): User {
  return { id: profile.id, name: profile.display_name, initials: profile.initials, color: profile.color, email: profile.email ?? undefined, avatarUrl: profile.avatar_url ?? undefined };
}

function mapTask(row: TaskRow & { assignee: ProfileRow | null }): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    assignee: row.assignee ? mapUser(row.assignee) : { id: "unassigned", name: "Unassigned", initials: "?", color: "#94a3b8" },
    dueDate: row.due_date,
    filesCount: row.files_count,
    tags: row.tags ?? [],
    highlighted: row.highlighted,
  };
}
