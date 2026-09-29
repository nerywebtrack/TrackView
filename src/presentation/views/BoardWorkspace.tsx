"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Interaction, User } from "@/core/domain/entities/User";
import type { Project } from "@/core/domain/entities/Project";
import { assigneesOf, type Priority, type Task } from "@/core/domain/entities/Task";
import type { Workspace } from "@/core/domain/entities/Workspace";
import Board from "@/presentation/components/board/Board";
import ProjectHeader from "@/presentation/components/board/ProjectHeader";
import TaskTicket from "@/presentation/components/board/TaskTicket";
import Sidebar from "@/presentation/components/layout/Sidebar";
import Topbar from "@/presentation/components/layout/Topbar";
import { CalendarIcon, ImageIcon, LinkIcon, MoreIcon, PaperclipIcon, PencilIcon, PlusIcon, SmileIcon } from "@/presentation/components/ui/Icons";
import Avatar from "@/presentation/components/ui/Avatar";

type Modal =
  | { type: "add-column" }
  | { type: "add-task"; columnId: string }
  | { type: "task-actions"; columnId: string; taskId: string }
  | { type: "project-settings" }
  | { type: "info"; title: string; message: string }
  | null;

type Props = {
  initialProject: Project;
  interactions: Interaction[];
  workspace: Workspace;
  currentUser: User;
  isAuthenticated: boolean;
};

const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const storageKey = "trackview-project";
const usesSupabase = process.env.NEXT_PUBLIC_DATA_PROVIDER === "supabase";

export default function BoardWorkspace({ initialProject, interactions, workspace, currentUser, isAuthenticated }: Props) {
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
    if (item !== "Projects") setModal({ type: "info", title: item, message: `La sección ${item} está lista para conectarse a su propio módulo. El tablero de Projects permanece disponible.` });
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
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    setProject((current) => ({ ...current, columns: [...current.columns, { id: `column-${Date.now()}`, name, totalCount: 0, tasks: [] }] }));
    setModal(null);
    setToast(`Columna “${name}” creada`);
  }

  function addTask(columnId: string, formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    const selectedIds = formData.getAll("assignee").map(String);
    const assignees = selectedIds.flatMap((id) => team.filter((user) => user.id === id));
    const assignee = assignees[0] ?? currentUser;
    const task: Task = {
      id: `task-${Date.now()}`,
      title,
      description: String(formData.get("description") ?? "").trim() || "Sin descripción.",
      priority: String(formData.get("priority") ?? "medium") as Priority,
      assignee,
      assignees: assignees.length ? assignees : [assignee],
      startDate: String(formData.get("startDate") ?? "") || undefined,
      dueDate: String(formData.get("dueDate") ?? "") || new Date().toISOString().slice(0, 10),
      filesCount: 0,
      tags: String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    setProject((current) => ({ ...current, columns: current.columns.map((column) => column.id === columnId ? { ...column, totalCount: column.totalCount + 1, tasks: [...column.tasks, task] } : column) }));
    setModal(null);
    setToast("Tarea creada correctamente");
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

  function updateProject(formData: FormData) {
    setProject((current) => ({ ...current, subtitle: String(formData.get("subtitle") ?? current.subtitle).trim(), visibility: formData.get("visibility") === "private" ? "private" : "public" }));
    setModal(null);
    setToast("Proyecto actualizado");
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
      <Sidebar workspace={workspace} interactions={interactions} collapsed={collapsed} activeItem={activeItem} onCollapse={() => setCollapsed((value) => !value)} onNavigate={navigate} onLogout={logout} onContacts={() => setModal({ type: "info", title: "Contactos", message: `${project.members.length + project.extraMembers} personas colaboran en este proyecto.` })} />
      <main className="flex min-w-0 flex-1 flex-col gap-5">
        <Topbar currentUser={currentUser} query={query} onQueryChange={setQuery} onAction={topbarAction} onLogout={logout} />
        {usesSupabase && !isAuthenticated && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>El tablero es público, pero debes iniciar sesión para guardar cambios.</span>
            <Link href="/login" className="rounded-full bg-amber-900 px-4 py-2 font-semibold text-white">Iniciar sesión</Link>
          </div>
        )}
        <ProjectHeader project={project} progress={progress} priorityFilter={priorityFilter} sortBy={sortBy} groupBy={groupBy} onPriorityFilter={cyclePriority} onSort={cycleSort} onGroup={cycleGroup} onAddColumn={() => setModal({ type: "add-column" })} onSubtitle={() => setModal({ type: "project-settings" })} />
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
          : modal.type === "add-task" ? <TaskForm users={team} manager={manager} currentUser={currentUser} status={project.columns.find((column) => column.id === modal.columnId)?.name ?? "To Do"} onSubmit={(data) => addTask(modal.columnId, data)} />
          : <>
          <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="dialog-title" className="text-xl font-bold text-slate-900">{modalTitle(modal, selectedTask)}</h2></div><button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-full px-2 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button></div>
          {modal.type === "add-column" && <form action={addColumn} className="space-y-4"><Field label="Nombre de la columna" name="name" autoFocus required /><Submit label="Crear columna" /></form>}
          {modal.type === "project-settings" && <form action={updateProject} className="space-y-4"><Field label="Descripción" name="subtitle" defaultValue={project.subtitle} required /><label className="block text-sm font-medium text-slate-700">Visibilidad<select name="visibility" defaultValue={project.visibility} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="public">Público</option><option value="private">Privado</option></select></label><Submit label="Guardar cambios" /></form>}
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
  if (modal.type === "project-settings") return "Configuración del proyecto";
  if (modal.type === "task-actions") return task?.title ?? "Acciones de tarea";
  return modal.title;
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input name={name} {...props} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>;
}

function Submit({ label, onClick }: { label: string; onClick?: () => void }) {
  return <button type={onClick ? "button" : "submit"} onClick={onClick} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">{label}</button>;
}

function TaskForm({ users, manager, currentUser, status, onSubmit }: { users: User[]; manager: User; currentUser: User; status: string; onSubmit: (data: FormData) => void }) {
  return <form action={onSubmit}>
    <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
      <h2 id="dialog-title" className="text-2xl font-bold text-slate-900">Project Ticket</h2>
      <div className="flex items-center gap-3">
        <span className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Draft</span>
        <button type="submit" className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600">Save Ticket</button>
      </div>
    </header>
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <span className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">✓ &nbsp;{status}</span>
      <div className="flex items-center gap-4 text-slate-500"><PaperclipIcon /><SmileIcon /><LinkIcon /><ImageIcon /><PencilIcon /><MoreIcon /></div>
    </div>
    <div className="grid gap-8 px-6 py-7 sm:grid-cols-2">
      <FormField label="Project name">
        <input name="title" autoFocus required placeholder="Nombre de la tarea" className="w-full border-0 border-b-2 border-transparent bg-transparent p-0 text-lg font-semibold text-slate-800 placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none" />
      </FormField>
      <FormField label="Project Manager">
        <Avatar user={manager} size={38} /><span>{manager.name}</span>
      </FormField>
      <FormField label="Assigned to">
        <div className="flex items-center gap-2">
          {users.map((user, index) => (
            <label key={user.id} className="relative cursor-pointer rounded-full">
              <input type="checkbox" name="assignee" value={user.id} defaultChecked={index === 0} className="peer sr-only" />
              <Avatar user={user} size={38} />
              <span className="pointer-events-none absolute -inset-0.5 rounded-full ring-indigo-500 peer-checked:ring-2" />
            </label>
          ))}
        </div>
      </FormField>
      <FormField label="Timeline">
        <CalendarIcon width={22} height={22} />
        <input type="date" name="startDate" defaultValue={today()} aria-label="Fecha de inicio" className="w-[8.5rem] border-0 bg-transparent p-0 text-base font-semibold text-slate-800 focus:outline-none" />
        <span className="text-slate-400">-</span>
        <input type="date" name="dueDate" defaultValue={today()} required aria-label="Fecha final" className="w-[8.5rem] border-0 bg-transparent p-0 text-base font-semibold text-slate-800 focus:outline-none" />
      </FormField>
      <FormField label="Priority">
        <select name="priority" defaultValue="medium" className="w-full border-0 bg-transparent p-0 text-lg font-semibold text-slate-800 focus:outline-none">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </FormField>
      <FormField label="Tags">
        <input name="tags" placeholder="diseño, backend..." className="w-full border-0 border-b-2 border-transparent bg-transparent p-0 text-lg font-semibold text-slate-800 placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none" />
      </FormField>
    </div>
    <div className="border-t border-slate-100 px-6 pt-5">
      <div className="flex gap-8 text-sm font-medium"><span className="border-b-4 border-amber-400 pb-3 text-slate-900">Comments <b className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">0</b></span><span className="pb-3 text-slate-400">Details</span><span className="pb-3 text-slate-400">Attachment</span></div>
      <div className="border-t border-slate-100 py-5">
        <div className="flex items-center gap-3"><Avatar user={currentUser} size={40} /><div><p className="font-semibold text-slate-800">{currentUser.name}</p><p className="text-xs text-slate-400">Nueva tarea · Hoy</p></div></div>
        <textarea name="description" rows={3} placeholder="Agrega una descripción para la tarea..." className="mt-4 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-100" />
        <div className="mt-4 flex justify-end"><button type="submit" className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><PlusIcon width={16} height={16} />Crear tarea</button></div>
      </div>
    </div>
  </form>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-sm text-slate-400">{label}</p><div className="flex items-center gap-3 text-lg font-semibold text-slate-800">{children}</div></div>;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
