"use client";

import { useEffect, useState } from "react";
import { columnKindOf, type BoardColumn, type ColumnKind } from "@/core/domain/entities/BoardColumn";
import type { Project, ProjectVisibility } from "@/core/domain/entities/Project";
import type { User } from "@/core/domain/entities/User";
import Avatar from "@/presentation/components/ui/Avatar";
import { ChevronDownIcon, PlusIcon, TrashIcon } from "@/presentation/components/ui/Icons";

type Team = { members: User[]; manager?: User };
type PendingAction = { action: "remove" | "restore" | "transfer"; user: User } | null;

export type ProjectSettingsProps = {
  project: Project;
  currentUser: User;
  connected: boolean;
  onBack: () => void;
  onSaveGeneral: (changes: { name: string; subtitle: string; visibility: ProjectVisibility }) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onChangeColumnKind: (columnId: string, kind: ColumnKind) => void;
  onMoveColumn: (columnId: string, direction: -1 | 1) => void;
  onAddColumn: (name: string) => void;
  onDeleteColumn: (columnId: string, moveTasksTo: string | null) => void;
  onTeamChange: (team: Team) => void;
  onToast: (message: string) => void;
};

export default function ProjectSettings(props: ProjectSettingsProps) {
  const { project, onBack } = props;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm">
            <button type="button" onClick={onBack} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-white/60">Projects</button>
            <span className="text-slate-300">/</span>
            <span className="rounded-lg px-2 py-1 text-slate-500">{project.name}</span>
            <span className="text-slate-300">/</span>
            <span className="rounded-lg bg-slate-100 px-2 py-1 font-medium text-slate-700">Settings</span>
          </nav>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Configuración del proyecto</h1>
          <p className="mt-1 text-sm text-slate-500">Edita los datos generales, los estados del tablero y quién participa.</p>
        </div>
        <button type="button" onClick={onBack} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Volver al tablero</button>
      </div>

      <GeneralSection {...props} />
      <StatesSection {...props} />
      <MembersSection {...props} />
    </div>
  );
}

function GeneralSection({ project, onSaveGeneral }: ProjectSettingsProps) {
  const [name, setName] = useState(project.name);
  const [subtitle, setSubtitle] = useState(project.subtitle);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const dirty = name !== project.name || subtitle !== project.subtitle || visibility !== project.visibility;

  function reset() {
    setName(project.name);
    setSubtitle(project.subtitle);
    setVisibility(project.visibility);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSaveGeneral({ name: name.trim(), subtitle: subtitle.trim(), visibility });
  }

  return (
    <Card title="General" description="Nombre, descripción y quién puede ver el tablero.">
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <Label text="Nombre del proyecto">
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} className={inputClass} />
        </Label>
        <Label text="Descripción">
          <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={140} placeholder="Assets & deliverables" className={inputClass} />
        </Label>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-medium text-slate-700">Visibilidad</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <VisibilityOption checked={visibility === "public"} onChange={() => setVisibility("public")} title="Público" text="Cualquiera con el enlace puede ver el tablero, y quien inicie sesión se une como miembro." />
            <VisibilityOption checked={visibility === "private"} onChange={() => setVisibility("private")} title="Privado" text="Solo los miembros actuales del workspace pueden ver y editar." />
          </div>
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" onClick={reset} disabled={!dirty} className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40">Descartar</button>
          <button type="submit" disabled={!dirty || !name.trim()} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40">Guardar cambios</button>
        </div>
      </form>
    </Card>
  );
}

function StatesSection({ project, onRenameColumn, onChangeColumnKind, onMoveColumn, onAddColumn, onDeleteColumn }: ProjectSettingsProps) {
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  function add(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onAddColumn(name);
    setNewName("");
  }

  return (
    <Card title="Estados" description="Cada estado es una columna del tablero. El orden aquí es el orden en el tablero.">
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
        {project.columns.map((column, index) => (
          <li key={column.id} className="p-3">
            <ColumnRow
              column={column}
              isFirst={index === 0}
              isLast={index === project.columns.length - 1}
              canDelete={project.columns.length > 1}
              onRename={(name) => onRenameColumn(column.id, name)}
              onKindChange={(kind) => onChangeColumnKind(column.id, kind)}
              onMove={(direction) => onMoveColumn(column.id, direction)}
              onDelete={() => setDeleting(column.id)}
            />
            {deleting === column.id && (
              <DeleteColumnPanel
                column={column}
                others={project.columns.filter((item) => item.id !== column.id)}
                onCancel={() => setDeleting(null)}
                onConfirm={(target) => { onDeleteColumn(column.id, target); setDeleting(null); }}
              />
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={40} placeholder="Nuevo estado, ej. QA" aria-label="Nombre del nuevo estado" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" disabled={!newName.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"><PlusIcon width={16} height={16} />Agregar estado</button>
      </form>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        El <strong className="text-slate-500">tipo</strong> define cómo se mide cada estado en el progreso y en los reportes:
        una tarea cuenta como terminada al entrar a un estado “Terminado”, y su tiempo de trabajo empieza a correr al entrar a uno “En curso”.
      </p>
    </Card>
  );
}

function ColumnRow({ column, isFirst, isLast, canDelete, onRename, onKindChange, onMove, onDelete }: { column: BoardColumn; isFirst: boolean; isLast: boolean; canDelete: boolean; onRename: (name: string) => void; onKindChange: (kind: ColumnKind) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const [name, setName] = useState(column.name);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(column.name);
      return;
    }
    if (trimmed !== column.name) onRename(trimmed);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label={`Subir ${column.name}`} className="grid h-5 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ChevronDownIcon width={14} height={14} className="rotate-180" /></button>
        <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label={`Bajar ${column.name}`} className="grid h-5 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ChevronDownIcon width={14} height={14} /></button>
      </div>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setName(column.name); event.currentTarget.blur(); }
        }}
        maxLength={40}
        aria-label={`Nombre del estado ${column.name}`}
        className="h-10 min-w-0 flex-1 rounded-xl border border-transparent px-3 text-[15px] font-semibold text-slate-800 outline-none hover:border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <select value={columnKindOf(column)} onChange={(event) => onKindChange(event.target.value as ColumnKind)} aria-label={`Tipo del estado ${column.name}`} className={`h-9 shrink-0 rounded-lg border px-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-100 ${KIND_STYLE[columnKindOf(column)]}`}>
        <option value="todo">Pendiente</option>
        <option value="active">En curso</option>
        <option value="done">Terminado</option>
      </select>
      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{column.tasks.length} {column.tasks.length === 1 ? "tarea" : "tareas"}</span>
      <button type="button" onClick={onDelete} disabled={!canDelete} title={canDelete ? "Eliminar estado" : "El tablero necesita al menos un estado"} aria-label={`Eliminar ${column.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"><TrashIcon width={18} height={18} /></button>
    </div>
  );
}

function DeleteColumnPanel({ column, others, onCancel, onConfirm }: { column: BoardColumn; others: BoardColumn[]; onCancel: () => void; onConfirm: (moveTasksTo: string | null) => void }) {
  const [target, setTarget] = useState(others[0]?.id ?? "__delete__");
  const count = column.tasks.length;

  return (
    <div className="mt-3 rounded-xl border border-red-100 bg-red-50/60 p-4 text-sm">
      <p className="font-semibold text-red-800">¿Eliminar el estado “{column.name}”?</p>
      {count > 0 ? (
        <label className="mt-2 block text-slate-700">
          Tiene {count} {count === 1 ? "tarea" : "tareas"}. ¿Qué hacemos con {count === 1 ? "ella" : "ellas"}?
          <select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-2 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:w-80">
            {others.map((item) => <option key={item.id} value={item.id}>Moverlas a “{item.name}”</option>)}
            <option value="__delete__">Eliminarlas junto con sus comentarios y adjuntos</option>
          </select>
        </label>
      ) : (
        <p className="mt-1 text-slate-600">No tiene tareas.</p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 font-semibold text-slate-600 hover:bg-white">Cancelar</button>
        <button type="button" onClick={() => onConfirm(count > 0 && target !== "__delete__" ? target : null)} className="h-9 rounded-lg bg-red-600 px-3 font-semibold text-white hover:bg-red-700">Eliminar estado</button>
      </div>
    </div>
  );
}

function MembersSection({ project, currentUser, connected, onTeamChange, onToast }: ProjectSettingsProps) {
  const [removed, setRemoved] = useState<User[]>([]);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const managerId = project.manager?.id;
  const isOwner = connected && managerId === currentUser.id;

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    fetch(`/api/projects/${project.id}/members`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar la lista de miembros");
        if (!cancelled) setRemoved(payload.removed as User[]);
      })
      .catch((error) => { if (!cancelled) onToast(error instanceof Error ? error.message : "No se pudo cargar la lista de miembros"); });
    return () => { cancelled = true; };
  }, [isOwner, project.id, onToast]);

  async function run(action: "remove" | "restore" | "transfer", user: User) {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId: user.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar el miembro");
      onTeamChange({ members: payload.members as User[], manager: (payload.manager as User | null) ?? undefined });
      setRemoved(payload.removed as User[]);
      onToast({ remove: `${user.name} fue removido`, restore: `${user.name} fue restaurado`, transfer: `${user.name} ahora es el dueño` }[action]);
      setPending(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "No se pudo actualizar el miembro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Usuarios" description="Personas que iniciaron sesión y forman parte del workspace de este proyecto.">
      {!connected && <Notice>La administración de usuarios requiere Supabase y una sesión iniciada.</Notice>}
      {connected && !isOwner && <Notice>Solo el dueño del proyecto ({project.manager?.name ?? "sin asignar"}) puede cambiar roles o remover personas.</Notice>}
      {isOwner && project.visibility === "public" && <Notice>El proyecto es público: cualquier persona que inicie sesión se une automáticamente, salvo las que remuevas aquí.</Notice>}

      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
        {project.members.map((user) => {
          const owner = user.id === managerId;
          const self = user.id === currentUser.id;
          return (
            <li key={user.id} className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar user={user} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-slate-800">{user.name}{self && <span className="ml-1.5 text-xs font-normal text-slate-400">(tú)</span>}</p>
                  <p className="truncate text-xs text-slate-400">{user.email ?? "Sin correo"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${owner ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{owner ? "Owner" : "Member"}</span>
                {isOwner && !owner && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setPending({ action: "transfer", user })} className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Hacer dueño</button>
                    <button type="button" onClick={() => setPending({ action: "remove", user })} className="h-9 rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50">Remover</button>
                  </div>
                )}
              </div>
              {pending?.user.id === user.id && pending.action !== "restore" && (
                <ConfirmPanel
                  danger={pending.action === "remove"}
                  busy={busy}
                  text={pending.action === "remove"
                    ? `${user.name} perderá acceso al tablero y no podrá volver a unirse hasta que lo restaures. Sus tareas y comentarios se conservan.`
                    : `${user.name} será el nuevo dueño y tú pasarás a ser miembro. Solo el dueño puede administrar usuarios.`}
                  confirmLabel={pending.action === "remove" ? "Remover" : "Transferir propiedad"}
                  onCancel={() => setPending(null)}
                  onConfirm={() => run(pending.action, user)}
                />
              )}
            </li>
          );
        })}
        {project.members.length === 0 && <li className="p-4 text-sm text-slate-400">Todavía no hay miembros.</li>}
      </ul>

      {isOwner && removed.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Removidos</p>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {removed.map((user) => (
              <li key={user.id} className="flex items-center gap-3 p-3 opacity-80">
                <Avatar user={user} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-700">{user.name}</p>
                  <p className="truncate text-xs text-slate-400">{user.email ?? "Sin correo"}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => run("restore", user)} className="h-9 rounded-lg px-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40">Restaurar</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ConfirmPanel({ text, confirmLabel, danger, busy, onCancel, onConfirm }: { text: string; confirmLabel: string; danger: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className={`mt-3 rounded-xl border p-4 text-sm ${danger ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60"}`}>
      <p className="text-slate-700">{text}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 font-semibold text-slate-600 hover:bg-white">Cancelar</button>
        <button type="button" disabled={busy} onClick={onConfirm} className={`h-9 rounded-lg px-3 font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>{busy ? "Guardando…" : confirmLabel}</button>
      </div>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mb-5 mt-1 text-sm text-slate-500">{description}</p>
      {children}
    </section>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700">{text}<div className="mt-1.5">{children}</div></label>;
}

function VisibilityOption({ checked, onChange, title, text }: { checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${checked ? "border-indigo-400 bg-indigo-50/50 ring-2 ring-indigo-100" : "border-slate-200 hover:bg-slate-50"}`}>
      <input type="radio" name="visibility" checked={checked} onChange={onChange} className="mt-1 accent-indigo-600" />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{children}</p>;
}

const KIND_STYLE: Record<ColumnKind, string> = {
  todo: "border-slate-200 bg-slate-50 text-slate-600",
  active: "border-sky-200 bg-sky-50 text-sky-700",
  done: "border-green-200 bg-green-50 text-green-700",
};

const inputClass = "h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
