"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Attachment } from "@/core/domain/entities/Attachment";
import type { User } from "@/core/domain/entities/User";
import type { Project, ProjectVisibility } from "@/core/domain/entities/Project";
import { assigneesOf, type Priority, type Task } from "@/core/domain/entities/Task";
import type { Workspace } from "@/core/domain/entities/Workspace";
import Board from "@/presentation/components/board/Board";
import ProjectHeader from "@/presentation/components/board/ProjectHeader";
import TaskTicket from "@/presentation/components/board/TaskTicket";
import TaskCreateForm, { type NewTaskInput } from "@/presentation/components/board/TaskCreateForm";
import ProjectSettings from "@/presentation/components/settings/ProjectSettings";
import Sidebar from "@/presentation/components/layout/Sidebar";
import Topbar from "@/presentation/components/layout/Topbar";

type Modal =
  | { type: "add-column" }
  | { type: "add-task"; columnId: string }
  | { type: "task-actions"; columnId: string; taskId: string }
  | { type: "info"; title: string; message: string }
  | null;

type Props = {
  initialProject: Project;
  workspace: Workspace;
  currentUser: User;
  isAuthenticated: boolean;
};

const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const storageKey = "trackview-project";
const usesSupabase = process.env.NEXT_PUBLIC_DATA_PROVIDER === "supabase";

export default function BoardWorkspace({ initialProject, workspace, currentUser, isAuthenticated }: Props) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [sortBy, setSortBy] = useState<"default" | "due date" | "priority" | "title">("default");
  const [groupBy, setGroupBy] = useState<"none" | "assignee" | "priority">("none");
  const [collapsed, setCollapsed] = useState(false);
  const [activeItem, setActiveItem] = useState("Projects");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; columnId: string } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const hydrated = useRef(false);
  const lastRemoteState = useRef(JSON.stringify(initialProject));

  useEffect(() => {
    if (usesSupabase) {
      hydrated.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setProject(JSON.parse(saved) as Project);
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        hydrated.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const serialized = JSON.stringify(project);
    if (!usesSupabase) {
      window.localStorage.setItem(storageKey, serialized);
      return;
    }
    if (!isAuthenticated) {
      return;
    }
    if (serialized === lastRemoteState.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: serialized,
        });
        if (!response.ok) throw new Error("No se pudo sincronizar con Supabase");
        lastRemoteState.current = serialized;
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Error de sincronización");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, isAuthenticated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const progress = useMemo(() => {
    const total = project.columns.reduce((sum, column) => sum + column.totalCount, 0);
    const done = project.columns.filter((column) => column.name.toLowerCase() === "done").reduce((sum, column) => sum + column.totalCount, 0);
    return total ? Math.round((done / total) * 100) : 0;
  }, [project]);

  const visibleColumns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return project.columns.map((column) => {
      let tasks = column.tasks.filter((task) => {
        const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
        const text = `${task.title} ${task.description} ${assigneesOf(task).map((user) => user.name).join(" ")} ${task.tags.join(" ")}`.toLocaleLowerCase();
        return matchesPriority && (!normalizedQuery || text.includes(normalizedQuery));
      });

      tasks = [...tasks].sort((a, b) => {
        if (groupBy === "assignee") return a.assignee.name.localeCompare(b.assignee.name);
        if (groupBy === "priority") return priorityOrder[a.priority] - priorityOrder[b.priority];
        if (sortBy === "due date") return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (sortBy === "priority") return priorityOrder[a.priority] - priorityOrder[b.priority];
        if (sortBy === "title") return a.title.localeCompare(b.title);
        return 0;
      });
      return { ...column, tasks };
    });
  }, [project, query, priorityFilter, sortBy, groupBy]);

  const team = useMemo(() => {
    const unique = new Map<string, User>();
    project.members.forEach((user) => unique.set(user.id, user));
    if (!unique.has(currentUser.id)) unique.set(currentUser.id, currentUser);
    return [...unique.values()];
  }, [project.members, currentUser]);
  const manager = project.manager ?? currentUser;
  const connected = usesSupabase && isAuthenticated;

  function cyclePriority() {
    const values: Array<typeof priorityFilter> = ["all", "high", "medium", "low"];
    setPriorityFilter(values[(values.indexOf(priorityFilter) + 1) % values.length]);
  }

  function cycleSort() {
    const values: Array<typeof sortBy> = ["default", "due date", "priority", "title"];
    setSortBy(values[(values.indexOf(sortBy) + 1) % values.length]);
  }

  function cycleGroup() {
    const values: Array<typeof groupBy> = ["none", "assignee", "priority"];
    setGroupBy(values[(values.indexOf(groupBy) + 1) % values.length]);
  }

  function navigate(item: string) {
    setActiveItem(item);
    if (item !== "Projects" && item !== "Settings") setModal({ type: "info", title: item, message: `La sección ${item} está lista para conectarse a su propio módulo. El tablero de Projects permanece disponible.` });
  }

  function topbarAction(action: "flags" | "messages" | "notifications" | "profile") {
    const content = {
      flags: ["Pendientes", "No tienes elementos marcados pendientes."],
      messages: ["Mensajes", "No hay mensajes nuevos."],
      notifications: ["Notificaciones", "Estás al día. No hay notificaciones nuevas."],
      profile: [currentUser.name, currentUser.email ? `${currentUser.email}. Tu perfil está activo en este espacio de trabajo.` : "Tu perfil está activo en este espacio de trabajo."],
    }[action];
    setModal({ type: "info", title: content[0], message: content[1] });
  }

  function addColumn(formData: FormData) {
    addColumnNamed(String(formData.get("name") ?? ""));
    setModal(null);
  }

  function addColumnNamed(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    setProject((current) => ({ ...current, columns: [...current.columns, { id: `column-${Date.now()}`, name, totalCount: 0, tasks: [] }] }));
    setToast(`Estado “${name}” creado`);
  }

  function renameColumn(columnId: string, name: string) {
    setProject((current) => ({ ...current, columns: current.columns.map((column) => column.id === columnId ? { ...column, name } : column) }));
    setToast(`Estado renombrado a “${name}”`);
  }

  function moveColumn(columnId: string, direction: -1 | 1) {
    setProject((current) => {
      const index = current.columns.findIndex((column) => column.id === columnId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.columns.length) return current;
      const columns = [...current.columns];
      [columns[index], columns[target]] = [columns[target], columns[index]];
      return { ...current, columns };
    });
  }

  function deleteColumn(columnId: string, moveTasksTo: string | null) {
    const column = project.columns.find((item) => item.id === columnId);
    if (!column || project.columns.length < 2) return;
    setProject((current) => {
      const source = current.columns.find((item) => item.id === columnId);
      return {
        ...current,
        columns: current.columns
          .filter((item) => item.id !== columnId)
          .map((item) => item.id === moveTasksTo && source
            ? { ...item, totalCount: item.totalCount + source.tasks.length, tasks: [...item.tasks, ...source.tasks] }
            : item),
      };
    });
    const target = moveTasksTo ? project.columns.find((item) => item.id === moveTasksTo) : undefined;
    setToast(target ? `Estado “${column.name}” eliminado; tareas movidas a “${target.name}”` : `Estado “${column.name}” eliminado`);
  }

  function saveGeneral(changes: { name: string; subtitle: string; visibility: ProjectVisibility }) {
    setProject((current) => ({ ...current, ...changes }));
    setToast("Proyecto actualizado");
  }

  async function createTask(input: NewTaskInput) {
    const assignee = input.assignees[0] ?? currentUser;
    const task: Task = {
      id: `task-${Date.now()}`,
      title: input.title,
      description: input.description || "Sin descripción.",
      priority: input.priority,
      assignee,
      assignees: input.assignees.length ? input.assignees : [assignee],
      startDate: input.startDate,
      dueDate: input.dueDate,
      filesCount: 0,
      tags: input.tags,
      attachments: [],
    };
    const next: Project = { ...project, columns: project.columns.map((column) => column.id === input.columnId ? { ...column, totalCount: column.totalCount + 1, tasks: [...column.tasks, task] } : column) };
    setModal(null);

    if (!input.files.length && !input.links.length) {
      setProject(next);
      setToast("Tarea creada correctamente");
      return;
    }

    if (!connected) {
      const localLinks: Attachment[] = input.links.map((url, index) => ({ id: `local-${Date.now()}-${index}`, taskId: task.id, kind: "link", name: new URL(url).hostname, url, path: "", size: 0, createdAt: new Date().toISOString() }));
      setProject({ ...next, columns: next.columns.map((column) => ({ ...column, tasks: column.tasks.map((item) => item.id === task.id ? { ...item, attachments: localLinks } : item) })) });
      setToast("Tarea creada correctamente");
      return;
    }

    // Attachments need the task to exist in Postgres first, so save right away
    // instead of waiting for the debounced sync.
    const serialized = JSON.stringify(next);
    lastRemoteState.current = serialized;
    setProject(next);
    setToast("Creando tarea y subiendo adjuntos…");
    try {
      const response = await fetch(`/api/projects/${next.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: serialized });
      if (!response.ok) throw new Error();
    } catch {
      lastRemoteState.current = "";
      setProject((current) => ({ ...current }));
      setToast("La tarea se creó, pero no se pudo sincronizar; los adjuntos no se subieron");
      return;
    }

    const uploaded: Attachment[] = [];
    const failed: string[] = [];
    for (const file of input.files) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body });
      if (response.ok) uploaded.push((await response.json()) as Attachment);
      else failed.push(file.name);
    }
    for (const url of input.links) {
      const response = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      if (response.ok) uploaded.push((await response.json()) as Attachment);
      else failed.push(url);
    }

    if (uploaded.length) {
      const fileCount = uploaded.filter((item) => item.kind === "file").length;
      patchTask(task.id, (item) => ({ ...item, attachments: [...(item.attachments ?? []), ...uploaded], filesCount: item.filesCount + fileCount }));
    }
    setToast(failed.length ? `Tarea creada; no se pudieron subir: ${failed.join(", ")}` : `Tarea creada con ${uploaded.length} ${uploaded.length === 1 ? "adjunto" : "adjuntos"}`);
  }

  function patchTask(taskId: string, change: (task: Task) => Task) {
    setProject((current) => ({ ...current, columns: current.columns.map((column) => ({ ...column, tasks: column.tasks.map((item) => item.id === taskId ? change(item) : item) })) }));
  }

  function deleteTask(columnId: string, taskId: string) {
    setProject((current) => ({ ...current, columns: current.columns.map((column) => column.id === columnId ? { ...column, totalCount: Math.max(0, column.totalCount - 1), tasks: column.tasks.filter((task) => task.id !== taskId) } : column) }));
    setModal(null);
    setToast("Tarea eliminada");
  }

  function updateTask(columnId: string, taskId: string, changes: Partial<Task>) {
    setProject((current) => ({ ...current, columns: current.columns.map((column) => column.id === columnId
      ? { ...column, tasks: column.tasks.map((task) => task.id === taskId ? { ...task, ...changes } : task) }
      : column) }));
    setToast("Tarea actualizada");
  }

  function moveTaskTo(sourceColumnId: string, taskId: string, targetColumnId: string) {
    const task = project.columns.find((column) => column.id === sourceColumnId)?.tasks.find((item) => item.id === taskId);
    const target = project.columns.find((column) => column.id === targetColumnId);
    if (!task || !target || sourceColumnId === targetColumnId) return;
    setProject((current) => ({ ...current, columns: current.columns.map((column) => {
      if (column.id === sourceColumnId) return { ...column, totalCount: Math.max(0, column.totalCount - 1), tasks: column.tasks.filter((item) => item.id !== taskId) };
      if (column.id === targetColumnId) return { ...column, totalCount: column.totalCount + 1, tasks: [...column.tasks, task] };
      return column;
    }) }));
    setModal({ type: "task-actions", columnId: targetColumnId, taskId });
    setToast(`Estado cambiado a ${target.name}`);
  }

  function duplicateTask(columnId: string, taskId: string) {
    const task = project.columns.find((column) => column.id === columnId)?.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const copy: Task = { ...task, id: `task-${Date.now()}`, title: `${task.title} (copia)`, attachments: [], filesCount: 0, highlighted: false };
    setProject((current) => ({ ...current, columns: current.columns.map((column) => column.id === columnId
      ? { ...column, totalCount: column.totalCount + 1, tasks: [...column.tasks, copy] }
      : column) }));
    setToast("Ticket duplicado");
  }

  function dropTask(targetColumnId: string) {
    if (!draggedTask) return;
    const { taskId, columnId: sourceColumnId } = draggedTask;
    setDraggedTask(null);
    setDropTargetId(null);
    if (sourceColumnId === targetColumnId) return;

    setProject((current) => {
      const source = current.columns.find((column) => column.id === sourceColumnId);
      const task = source?.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      return {
        ...current,
        columns: current.columns.map((column) => {
          if (column.id === sourceColumnId) return { ...column, totalCount: Math.max(0, column.totalCount - 1), tasks: column.tasks.filter((item) => item.id !== taskId) };
          if (column.id === targetColumnId) return { ...column, totalCount: column.totalCount + 1, tasks: [...column.tasks, task] };
          return column;
        }),
      };
    });
    const target = project.columns.find((column) => column.id === targetColumnId);
    setToast(`Tarea movida a ${target?.name ?? "otra columna"}`);
  }

  async function logout() {
    if (!usesSupabase) {
      setModal({ type: "info", title: "Cerrar sesión", message: "El modo local no utiliza autenticación." });
      return;
    }
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const selectedTask = modal?.type === "task-actions"
    ? project.columns.find((column) => column.id === modal.columnId)?.tasks.find((task) => task.id === modal.taskId)
    : undefined;

  return (
    <div className="flex min-h-screen gap-4 bg-[#e6eafb] p-3 sm:p-4">
      <Sidebar workspace={workspace} members={team} managerId={project.manager?.id} currentUserId={currentUser.id} collapsed={collapsed} activeItem={activeItem} onCollapse={() => setCollapsed((value) => !value)} onNavigate={navigate} onLogout={logout} onContacts={() => setModal({ type: "info", title: "Contactos", message: `${project.members.length + project.extraMembers} personas colaboran en este proyecto.` })} />
      <main className="flex min-w-0 flex-1 flex-col gap-5">
        <Topbar currentUser={currentUser} query={query} onQueryChange={setQuery} onAction={topbarAction} onLogout={logout} />
        {usesSupabase && !isAuthenticated && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>El tablero es público, pero debes iniciar sesión para guardar cambios.</span>
            <Link href="/login" className="rounded-full bg-amber-900 px-4 py-2 font-semibold text-white">Iniciar sesión</Link>
          </div>
        )}
        {activeItem === "Settings" ? (
          <ProjectSettings
            project={project}
            currentUser={currentUser}
            connected={connected}
            onBack={() => navigate("Projects")}
            onSaveGeneral={saveGeneral}
            onRenameColumn={renameColumn}
            onMoveColumn={moveColumn}
            onAddColumn={addColumnNamed}
            onDeleteColumn={deleteColumn}
            onTeamChange={({ members, manager: owner }) => setProject((current) => ({ ...current, members, manager: owner }))}
            onToast={setToast}
          />
        ) : (
          <>
          <ProjectHeader project={project} progress={progress} priorityFilter={priorityFilter} sortBy={sortBy} groupBy={groupBy} onPriorityFilter={cyclePriority} onSort={cycleSort} onGroup={cycleGroup} onAddColumn={() => setModal({ type: "add-column" })} onSubtitle={() => navigate("Settings")} />
          {(query || priorityFilter !== "all") && <p className="-mb-2 text-sm text-slate-600">Mostrando {visibleColumns.reduce((sum, column) => sum + column.tasks.length, 0)} resultados <button type="button" className="ml-2 font-semibold text-indigo-600" onClick={() => { setQuery(""); setPriorityFilter("all"); }}>Limpiar</button></p>}
          <Board
            columns={visibleColumns}
            dropTargetId={dropTargetId}
            onAddTask={(columnId) => setModal({ type: "add-task", columnId })}
            onTaskAction={(taskId, columnId) => setModal({ type: "task-actions", taskId, columnId })}
            onDragStart={(taskId, columnId) => setDraggedTask({ taskId, columnId })}
            onDragEnd={() => { setDraggedTask(null); setDropTargetId(null); }}
            onDragOver={setDropTargetId}
            onDrop={dropTask}
          />
          </>
        )}
      </main>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`my-auto w-full rounded-[28px] bg-white shadow-2xl ${modal.type === "task-actions" || modal.type === "add-task" ? "max-w-[660px]" : "max-w-md p-6"}`}>
          {modal.type === "task-actions" && selectedTask ? <TaskTicket
            key={selectedTask.id}
            task={selectedTask}
            columnId={modal.columnId}
            columns={project.columns.map((column) => ({ id: column.id, name: column.name }))}
            team={team}
            manager={manager}
            currentUser={currentUser}
            connected={connected}
            onEdit={(changes) => updateTask(modal.columnId, modal.taskId, changes)}
            onMoveTo={(targetColumnId) => moveTaskTo(modal.columnId, modal.taskId, targetColumnId)}
            onDuplicate={() => duplicateTask(modal.columnId, modal.taskId)}
            onDelete={() => deleteTask(modal.columnId, modal.taskId)}
            onClose={() => setModal(null)}
            onToast={setToast}
          />
          : modal.type === "add-task" ? <TaskCreateForm
            columns={project.columns.map((column) => ({ id: column.id, name: column.name }))}
            initialColumnId={modal.columnId}
            team={team}
            manager={manager}
            currentUser={currentUser}
            connected={connected}
            onCreate={createTask}
            onCancel={() => setModal(null)}
            onToast={setToast}
          />
          : <>
          <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="dialog-title" className="text-xl font-bold text-slate-900">{modalTitle(modal, selectedTask)}</h2></div><button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-full px-2 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button></div>
          {modal.type === "add-column" && <form action={addColumn} className="space-y-4"><Field label="Nombre de la columna" name="name" autoFocus required /><Submit label="Crear columna" /></form>}
          {modal.type === "info" && <><p className="text-sm leading-6 text-slate-600">{modal.message}</p><div className="mt-5"><Submit label="Entendido" onClick={() => setModal(null)} /></div></>}
          </>}
        </section>
      </div>}
      {toast && <div role="status" className="fixed bottom-5 right-5 z-[60] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function modalTitle(modal: NonNullable<Modal>, task?: Task) {
  if (modal.type === "add-column") return "Nueva columna";
  if (modal.type === "add-task") return "Nueva tarea";
  if (modal.type === "task-actions") return task?.title ?? "Acciones de tarea";
  return modal.title;
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input name={name} {...props} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>;
}

function Submit({ label, onClick }: { label: string; onClick?: () => void }) {
  return <button type={onClick ? "button" : "submit"} onClick={onClick} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">{label}</button>;
}
