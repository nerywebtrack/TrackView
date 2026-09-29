"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "@/core/domain/entities/Attachment";
import type { TaskComment } from "@/core/domain/entities/Comment";
import { assigneesOf, type Priority, type Task } from "@/core/domain/entities/Task";
import type { User } from "@/core/domain/entities/User";
import Avatar from "@/presentation/components/ui/Avatar";
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ImageIcon,
  LinkIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  ReplyIcon,
  SmileIcon,
  TrashIcon,
} from "@/presentation/components/ui/Icons";

type Tab = "comments" | "details" | "attachments";
type Popover = "status" | "emoji" | "more" | "delete" | "assignee";
type Draft = { title: string; description: string; assigneeIds: string[]; startDate: string; dueDate: string; priority: Priority; tags: string };

const EMOJIS = ["👍", "🎉", "🔥", "✅", "👀", "🙏", "😄", "❤️", "🚀", "💡", "⚠️", "📌"];
const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };

export type TaskTicketProps = {
  task: Task;
  columnId: string;
  columns: Array<{ id: string; name: string }>;
  team: User[];
  manager: User;
  currentUser: User;
  connected: boolean;
  onEdit: (changes: Partial<Task>) => void;
  onMoveTo: (columnId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

export default function TaskTicket({ task, columnId, columns, team, manager, currentUser, connected, onEdit, onMoveTo, onDuplicate, onDelete, onClose, onToast }: TaskTicketProps) {
  const savedDraft = useMemo(() => toDraft(task), [task]);
  const [draft, setDraft] = useState<Draft>(savedDraft);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("comments");
  const [popover, setPopover] = useState<Popover | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(connected);
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [commentMenu, setCommentMenu] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const attachments = task.attachments ?? [];
  const status = columns.find((column) => column.id === columnId)?.name ?? "Sin estado";
  const assigneeOptions = useMemo(() => {
    const extra = assigneesOf(task).filter((user) => user.id !== "unassigned" && !team.some((member) => member.id === user.id));
    return [...team, ...extra];
  }, [team, task]);
  const assignees = draft.assigneeIds.flatMap((id) => assigneeOptions.filter((user) => user.id === id));
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const rootComments = comments.filter((comment) => !comment.parentId);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch(`/api/tasks/${task.id}/comments`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los comentarios");
        if (!cancelled) setComments(payload as TaskComment[]);
      })
      .catch((error) => {
        if (!cancelled) onToast(error instanceof Error ? error.message : "No se pudieron cargar los comentarios");
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, task.id, onToast]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleAssignee(userId: string) {
    const selected = draft.assigneeIds.includes(userId);
    if (selected && draft.assigneeIds.length === 1) {
      onToast("El ticket necesita al menos una persona asignada");
      return;
    }
    update("assigneeIds", selected ? draft.assigneeIds.filter((id) => id !== userId) : [...draft.assigneeIds, userId]);
  }

  function togglePopover(name: Popover) {
    setPopover((current) => (current === name ? null : name));
  }

  function save() {
    if (!draft.title.trim()) {
      onToast("El nombre del ticket no puede estar vacío");
      setEditing(true);
      return;
    }
    if (draft.startDate && draft.dueDate && draft.startDate > draft.dueDate) {
      onToast("La fecha de inicio no puede ser posterior a la fecha final");
      setEditing(true);
      return;
    }
    if (dirty) {
      onEdit({
        title: draft.title.trim(),
        description: draft.description.trim() || "Sin descripción.",
        assignee: assignees[0] ?? task.assignee,
        assignees,
        priority: draft.priority,
        startDate: draft.startDate || undefined,
        dueDate: draft.dueDate || task.dueDate,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
    }
    onClose();
  }

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    if (!connected) {
      onToast("Inicia sesión (con Supabase activo) para adjuntar archivos reales.");
      return;
    }
    setTab("attachments");
    setUploading(true);
    const uploaded: Attachment[] = [];
    try {
      for (const file of selected) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? `No se pudo subir ${file.name}`);
        uploaded.push(payload as Attachment);
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (uploaded.length) {
        onEdit({ attachments: [...attachments, ...uploaded], filesCount: task.filesCount + uploaded.length });
        onToast(uploaded.length > 1 ? `${uploaded.length} archivos subidos` : "Archivo subido");
      }
    }
  }

  async function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    let attachment: Attachment;
    if (connected) {
      const response = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const payload = await response.json();
      if (!response.ok) {
        onToast(payload.error ?? "No se pudo agregar el enlace");
        return;
      }
      attachment = payload as Attachment;
    } else {
      attachment = { id: `local-${Date.now()}`, taskId: task.id, kind: "link", name: safeHostname(url), url, path: "", size: 0, createdAt: new Date().toISOString() };
    }
    onEdit({ attachments: [...attachments, attachment] });
    onToast("Enlace agregado");
    setLinkUrl("");
    setLinkForm(false);
  }

  async function removeAttachment(attachment: Attachment) {
    if (connected) {
      const response = await fetch(`/api/tasks/${task.id}/attachments?attachmentId=${attachment.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        onToast(payload.error ?? "No se pudo eliminar el adjunto");
        return;
      }
    }
    onEdit({
      attachments: attachments.filter((item) => item.id !== attachment.id),
      filesCount: attachment.kind === "file" ? Math.max(0, task.filesCount - 1) : task.filesCount,
    });
    onToast("Adjunto eliminado");
  }

  async function postComment(body: string, parentId: string | null) {
    const text = body.trim();
    if (!text) return false;
    if (!connected) {
      setComments((current) => [...current, { id: `local-${Date.now()}`, taskId: task.id, parentId, author: currentUser, body: text, createdAt: new Date().toISOString() }]);
      return true;
    }
    const response = await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, parentId }) });
    const payload = await response.json();
    if (!response.ok) {
      onToast(payload.error ?? "No se pudo publicar el comentario");
      return false;
    }
    setComments((current) => [...current, payload as TaskComment]);
    return true;
  }

  async function submitComposer() {
    if (await postComment(composer, null)) setComposer("");
  }

  async function submitReply(parentId: string) {
    if (await postComment(replyText, parentId)) {
      setReplyText("");
      setReplyTo(null);
    }
  }

  async function deleteComment(comment: TaskComment) {
    setCommentMenu(null);
    if (connected) {
      const response = await fetch(`/api/tasks/${task.id}/comments?commentId=${comment.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        onToast(payload.error ?? "No se pudo eliminar el comentario");
        return;
      }
    }
    setComments((current) => current.filter((item) => item.id !== comment.id && item.parentId !== comment.id));
  }

  async function copyComment(comment: TaskComment) {
    setCommentMenu(null);
    try {
      await navigator.clipboard.writeText(comment.body);
      onToast("Comentario copiado");
    } catch {
      onToast("No se pudo copiar el comentario");
    }
  }

  function startReply(comment: TaskComment) {
    setReplyTo(comment.id);
    setReplyText("");
    window.setTimeout(() => replyRef.current?.focus(), 0);
  }

  function insertEmoji(emoji: string) {
    setPopover(null);
    setTab("comments");
    if (replyTo) {
      setReplyText((current) => current + emoji);
      window.setTimeout(() => replyRef.current?.focus(), 0);
    } else {
      setComposer((current) => current + emoji);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    }
  }

  function roleOf(user: User) {
    const member = team.find((item) => item.id === user.id);
    if (!member) return "Guest";
    return member.role === "owner" ? "Project Owner" : "Member";
  }

  return (
    <div className="text-slate-800">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={uploadFiles} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={uploadFiles} />

      <header className="flex items-center justify-between gap-4 border-b border-slate-200/80 px-6 py-5">
        <h2 id="dialog-title" className="text-[22px] font-semibold tracking-tight text-slate-800">Project Ticket</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} title="Cerrar sin guardar cambios" className="h-11 rounded-xl border border-slate-200 px-5 text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50">Draft</button>
          <button type="button" onClick={save} className="relative h-11 rounded-xl bg-[#0aa5f5] px-5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#0894dc]">
            Save Ticket
            {dirty && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" aria-label="Cambios sin guardar" />}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-5">
        <div className="relative">
          <button type="button" onClick={() => togglePopover("status")} aria-haspopup="listbox" aria-expanded={popover === "status"} className="flex h-12 items-center gap-2.5 rounded-xl border border-slate-200 pl-4 pr-3 text-[16px] font-medium text-slate-800 transition hover:bg-slate-50">
            <CheckCircleIcon className="text-green-500" />
            {status}
            <ChevronDownIcon width={16} height={16} className="text-slate-400" />
          </button>
          {popover === "status" && (
            <Menu className="left-0 w-56" onClose={() => setPopover(null)}>
              <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Mover a</p>
              {columns.map((column) => (
                <MenuItem key={column.id} active={column.id === columnId} onClick={() => { setPopover(null); if (column.id !== columnId) onMoveTo(column.id); }}>
                  {column.name}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToolButton title="Adjuntar archivo" onClick={() => fileInputRef.current?.click()}><PaperclipIcon width={21} height={21} /></ToolButton>
          <div className="relative">
            <ToolButton title="Insertar emoji" active={popover === "emoji"} onClick={() => togglePopover("emoji")}><SmileIcon width={21} height={21} /></ToolButton>
            {popover === "emoji" && (
              <Menu className="right-0 w-60" onClose={() => setPopover(null)}>
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="h-9 rounded-lg text-lg transition hover:bg-slate-100">{emoji}</button>
                  ))}
                </div>
              </Menu>
            )}
          </div>
          <Divider />
          <ToolButton title="Agregar enlace" onClick={() => { setTab("attachments"); setLinkForm(true); }}><LinkIcon width={21} height={21} /></ToolButton>
          <ToolButton title="Subir imagen" onClick={() => imageInputRef.current?.click()}><ImageIcon width={21} height={21} /></ToolButton>
          <ToolButton title={editing ? "Terminar edición" : "Editar ticket"} active={editing} onClick={() => setEditing((value) => !value)}><PencilIcon width={21} height={21} /></ToolButton>
          <Divider />
          <div className="relative">
            <ToolButton title="Más acciones" active={popover === "more"} onClick={() => togglePopover("more")}><MoreVerticalIcon width={21} height={21} /></ToolButton>
            {popover === "more" && (
              <Menu className="right-0 w-52" onClose={() => setPopover(null)}>
                <MenuItem onClick={() => { setPopover(null); onEdit({ highlighted: !task.highlighted }); }}>{task.highlighted ? "Quitar destacado" : "Destacar ticket"}</MenuItem>
                <MenuItem onClick={() => { setPopover(null); onDuplicate(); }}>Duplicar ticket</MenuItem>
                <MenuItem onClick={() => { setPopover(null); setEditing(true); }}>Editar ticket</MenuItem>
              </Menu>
            )}
          </div>
          <div className="relative">
            <ToolButton title="Eliminar ticket" danger active={popover === "delete"} onClick={() => togglePopover("delete")}><TrashIcon width={21} height={21} /></ToolButton>
            {popover === "delete" && (
              <Menu className="right-0 w-64" onClose={() => setPopover(null)}>
                <p className="px-2.5 pb-3 pt-1.5 text-sm leading-5 text-slate-600">¿Eliminar este ticket? También se borrarán sus comentarios y adjuntos.</p>
                <div className="flex justify-end gap-2 px-1 pb-1">
                  <button type="button" onClick={() => setPopover(null)} className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                  <button type="button" onClick={onDelete} className="h-9 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700">Eliminar</button>
                </div>
              </Menu>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-8 px-6 py-7 sm:grid-cols-2">
        <TicketField label="Project name">
          {editing
            ? <input value={draft.title} onChange={(event) => update("title", event.target.value)} autoFocus aria-label="Nombre del ticket" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-[17px] font-semibold outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
            : <p className="text-[17px] font-semibold text-slate-800">{draft.title}</p>}
        </TicketField>

        <TicketField label="Project Manager">
          <div className="flex items-center gap-3">
            <Avatar user={manager} size={40} />
            <span className="text-[17px] font-semibold text-slate-800">{manager.name}</span>
          </div>
        </TicketField>

        <TicketField label="Assigned to">
          <div className="relative">
            <button type="button" onClick={() => togglePopover("assignee")} aria-haspopup="listbox" aria-expanded={popover === "assignee"} title={assignees.length ? `Asignado a ${assignees.map((user) => user.name).join(", ")}` : "Asignar personas"} className="flex items-center rounded-full">
              {assignees.slice(0, 4).map((user) => <Avatar key={user.id} user={user} size={40} className="-ml-2.5 first:ml-0" />)}
              {assignees.length > 4 && <span className="-ml-2.5 grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white">+{assignees.length - 4}</span>}
              <span className="-ml-2.5 grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 ring-2 ring-white transition hover:border-sky-400 hover:text-sky-500"><PlusIcon width={16} height={16} /></span>
            </button>
            {popover === "assignee" && (
              <Menu className="left-0 w-72" onClose={() => setPopover(null)}>
                <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Asignar personas</p>
                <div className="max-h-64 overflow-y-auto">
                  {assigneeOptions.map((user) => (
                    <button key={user.id} type="button" role="menuitemcheckbox" aria-checked={draft.assigneeIds.includes(user.id)} onClick={() => toggleAssignee(user.id)} className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 ${draft.assigneeIds.includes(user.id) ? "bg-sky-50" : ""}`}>
                      <Avatar user={user} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{user.name}</span>
                        <span className="block truncate text-xs text-slate-400">{user.email ?? roleOf(user)}</span>
                      </span>
                      {draft.assigneeIds.includes(user.id) && <CheckCircleIcon width={18} height={18} className="text-sky-500" />}
                    </button>
                  ))}
                </div>
              </Menu>
            )}
          </div>
        </TicketField>

        <TicketField label="Timeline">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <CalendarIcon width={22} height={22} className="text-slate-500" />
              <input type="date" value={draft.startDate} max={draft.dueDate || undefined} onChange={(event) => update("startDate", event.target.value)} aria-label="Fecha de inicio" className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold outline-none focus:border-sky-400" />
              <span className="text-slate-400">-</span>
              <input type="date" value={draft.dueDate} min={draft.startDate || undefined} onChange={(event) => update("dueDate", event.target.value)} aria-label="Fecha final" className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold outline-none focus:border-sky-400" />
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[17px] font-semibold text-slate-800">
              <CalendarIcon width={24} height={24} className="text-slate-500" />
              {formatTimeline(draft.startDate, draft.dueDate)}
            </div>
          )}
        </TicketField>
      </div>

      <div className="border-b border-slate-200/80 px-6">
        <div role="tablist" className="flex gap-8">
          <TabButton active={tab === "comments"} onClick={() => setTab("comments")}>
            Comments
            {comments.length > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{comments.length}</span>}
          </TabButton>
          <TabButton active={tab === "details"} onClick={() => setTab("details")}>Details</TabButton>
          <TabButton active={tab === "attachments"} onClick={() => setTab("attachments")}>
            Attachment
            {attachments.length > 0 && <span className="text-sm text-slate-400">{attachments.length}</span>}
          </TabButton>
        </div>
      </div>

      {tab === "comments" && (
        <div className="px-6 py-6">
          {commentsLoading && <p className="text-sm text-slate-400">Cargando comentarios…</p>}
          {!commentsLoading && rootComments.length === 0 && <p className="text-sm text-slate-400">Todavía no hay comentarios. Escribe el primero abajo.</p>}
          <div className="space-y-7">
            {rootComments.map((comment) => (
              <div key={comment.id}>
                <CommentItem
                  comment={comment}
                  role={roleOf(comment.author)}
                  canDelete={comment.author.id === currentUser.id}
                  menuOpen={commentMenu === comment.id}
                  onMenu={() => setCommentMenu((current) => (current === comment.id ? null : comment.id))}
                  onCloseMenu={() => setCommentMenu(null)}
                  onCopy={() => copyComment(comment)}
                  onDelete={() => deleteComment(comment)}
                  onReply={() => startReply(comment)}
                />
                {(comments.some((reply) => reply.parentId === comment.id) || replyTo === comment.id) && (
                  <div className="ml-16 mt-4 space-y-4 border-l-2 border-slate-100 pl-4">
                    {comments.filter((reply) => reply.parentId === comment.id).map((reply) => (
                      <CommentItem
                        key={reply.id}
                        compact
                        comment={reply}
                        role={roleOf(reply.author)}
                        canDelete={reply.author.id === currentUser.id}
                        menuOpen={commentMenu === reply.id}
                        onMenu={() => setCommentMenu((current) => (current === reply.id ? null : reply.id))}
                        onCloseMenu={() => setCommentMenu(null)}
                        onCopy={() => copyComment(reply)}
                        onDelete={() => deleteComment(reply)}
                        onReply={() => startReply(comment)}
                      />
                    ))}
                    {replyTo === comment.id && (
                      <Composer
                        textareaRef={replyRef}
                        user={currentUser}
                        value={replyText}
                        placeholder={`Responder a ${comment.author.name}…`}
                        submitLabel="Reply"
                        onChange={setReplyText}
                        onSubmit={() => submitReply(comment.id)}
                        onCancel={() => { setReplyTo(null); setReplyText(""); }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-7">
            <Composer textareaRef={composerRef} user={currentUser} value={composer} placeholder="Escribe un comentario…" submitLabel="Comment" onChange={setComposer} onSubmit={submitComposer} />
          </div>
        </div>
      )}

      {tab === "details" && (
        <div className="space-y-6 px-6 py-6">
          <TicketField label="Description">
            <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} rows={4} placeholder="Describe el objetivo del ticket…" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-6 text-slate-800 outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100" />
          </TicketField>
          <div className="grid gap-6 sm:grid-cols-2">
            <TicketField label="Priority">
              <select value={draft.priority} onChange={(event) => update("priority", event.target.value as Priority)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-semibold text-slate-800 outline-none focus:border-sky-400">
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
              </select>
            </TicketField>
            <TicketField label="Tags">
              <input value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="Diseño, Backend" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] font-semibold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-300 focus:border-sky-400" />
            </TicketField>
          </div>
          <p className="text-xs text-slate-400">Los cambios se aplican al presionar <strong className="text-slate-500">Save Ticket</strong>.</p>
        </div>
      )}

      {tab === "attachments" && (
        <div className="px-6 py-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <OutlineButton onClick={() => fileInputRef.current?.click()}><PaperclipIcon width={17} height={17} />Subir archivo</OutlineButton>
            <OutlineButton onClick={() => imageInputRef.current?.click()}><ImageIcon width={17} height={17} />Subir imagen</OutlineButton>
            <OutlineButton onClick={() => setLinkForm(true)}><LinkIcon width={17} height={17} />Agregar enlace</OutlineButton>
          </div>
          {linkForm && (
            <form onSubmit={(event) => { event.preventDefault(); addLink(); }} className="mb-4 flex flex-wrap gap-2">
              <input type="url" required autoFocus value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" aria-label="Enlace" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
              <button type="submit" className="h-10 rounded-xl bg-[#0aa5f5] px-4 text-sm font-semibold text-white hover:bg-[#0894dc]">Agregar</button>
              <button type="button" onClick={() => { setLinkForm(false); setLinkUrl(""); }} className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
            </form>
          )}
          {uploading && <p className="mb-3 text-sm text-sky-600">Subiendo al bucket de Supabase…</p>}
          {attachments.length === 0 && !uploading && <p className="text-sm text-slate-400">Todavía no hay archivos ni enlaces adjuntos.</p>}
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                {isImage(attachment) && attachment.url
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Supabase URL, not optimizable
                  ? <img src={attachment.url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">{attachment.kind === "link" ? <LinkIcon width={18} height={18} /> : <PaperclipIcon width={18} height={18} />}</span>}
                <a href={attachment.url || undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800 hover:text-sky-600">{attachment.name}</span>
                  <span className="block truncate text-xs text-slate-400">{attachment.kind === "link" ? attachment.url : formatBytes(attachment.size)} · {formatShortDate(attachment.createdAt)}</span>
                </a>
                {(connected || attachment.id.startsWith("local-")) && (
                  <button type="button" onClick={() => removeAttachment(attachment)} aria-label={`Eliminar ${attachment.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><TrashIcon width={17} height={17} /></button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment, role, canDelete, compact = false, menuOpen, onMenu, onCloseMenu, onCopy, onDelete, onReply }: { comment: TaskComment; role: string; canDelete: boolean; compact?: boolean; menuOpen: boolean; onMenu: () => void; onCloseMenu: () => void; onCopy: () => void; onDelete: () => void; onReply: () => void }) {
  return (
    <div className="flex gap-4">
      <Avatar user={comment.author} size={compact ? 36 : 48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`truncate font-bold text-slate-800 ${compact ? "text-[15px]" : "text-[16px]"}`}>{comment.author.name}</p>
            <p className="mt-1 flex items-center gap-2 text-[14px] text-slate-400">
              {role}
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true" />
              <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
            </p>
          </div>
          <div className="relative">
            <button type="button" onClick={onMenu} aria-label="Opciones del comentario" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><MoreVerticalIcon width={18} height={18} /></button>
            {menuOpen && (
              <Menu className="right-0 w-44" onClose={onCloseMenu}>
                <MenuItem onClick={onCopy}>Copiar texto</MenuItem>
                {compact && <MenuItem onClick={() => { onCloseMenu(); onReply(); }}>Responder</MenuItem>}
                {canDelete && <MenuItem danger onClick={onDelete}>Eliminar</MenuItem>}
              </Menu>
            )}
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-4 py-3.5 text-[15px] leading-6 text-slate-800">{comment.body}</p>
        {!compact && (
          <button type="button" onClick={onReply} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[15px] font-medium text-slate-800 transition hover:bg-slate-50">
            <ReplyIcon width={18} height={18} />
            Reply
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({ textareaRef, user, value, placeholder, submitLabel, onChange, onSubmit, onCancel }: { textareaRef: React.RefObject<HTMLTextAreaElement | null>; user: User; value: string; placeholder: string; submitLabel: string; onChange: (value: string) => void; onSubmit: () => void; onCancel?: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar user={user} size={36} />
      <div className="min-w-0 flex-1 rounded-xl border border-slate-200 transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSubmit(); } }}
          placeholder={placeholder}
          className="block w-full resize-none rounded-xl bg-transparent px-4 pt-3 text-[15px] leading-6 outline-none placeholder:text-slate-400"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className="pl-2 text-xs text-slate-400">Ctrl + Enter para enviar</span>
          <div className="flex gap-1">
            {onCancel && <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>}
            <button type="button" onClick={onSubmit} disabled={!value.trim()} className="h-9 rounded-lg bg-[#0aa5f5] px-4 text-sm font-semibold text-white transition hover:bg-[#0894dc] disabled:cursor-not-allowed disabled:opacity-40">{submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="mb-3 text-[15px] text-slate-400">{label}</p>{children}</div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`relative flex items-center gap-2 pb-4 pt-1 text-[16px] transition ${active ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
      {children}
      {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-amber-400" aria-hidden="true" />}
    </button>
  );
}

function ToolButton({ title, onClick, active = false, danger = false, children }: { title: string; onClick: () => void; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  const tone = danger ? "text-red-600 hover:bg-red-50" : active ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700";
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`grid h-10 w-10 place-items-center rounded-lg transition ${tone}`}>{children}</button>;
}

function OutlineButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">{children}</button>;
}

function Divider() {
  return <span className="mx-1.5 h-6 w-px bg-slate-200" aria-hidden="true" />;
}

function Menu({ className = "", onClose, children }: { className?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-20" aria-hidden="true" onMouseDown={onClose} />
      <div role="menu" className={`absolute top-full z-30 mt-2 rounded-xl border border-slate-100 bg-white p-1.5 text-sm shadow-xl ${className}`}>{children}</div>
    </>
  );
}

function MenuItem({ active = false, danger = false, onClick, children }: { active?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-medium transition ${danger ? "text-red-600 hover:bg-red-50" : active ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50"}`}>
      {children}
      {active && <CheckCircleIcon width={16} height={16} className="text-sky-500" />}
    </button>
  );
}

function toDraft(task: Task): Draft {
  return {
    title: task.title,
    description: task.description,
    assigneeIds: assigneesOf(task).map((user) => user.id).filter((id) => id !== "unassigned"),
    startDate: toInputDate(task.startDate),
    dueDate: toInputDate(task.dueDate),
    priority: task.priority,
    tags: task.tags.join(", "),
  };
}

function toInputDate(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year}` : value;
}

function formatTimeline(start: string, due: string) {
  if (start && due) return `${formatDisplayDate(start)} - ${formatDisplayDate(due)}`;
  if (due) return formatDisplayDate(due);
  if (start) return `Desde ${formatDisplayDate(start)}`;
  return "Sin fechas";
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  const sixDays = 6 * 24 * 60 * 60 * 1000;
  const options: Intl.DateTimeFormatOptions = Date.now() - date.getTime() < sixDays
    ? { weekday: "long", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat("en-US", options).format(date).replace(",", "");
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function isImage(attachment: Attachment) {
  return attachment.kind === "file" && (attachment.contentType?.startsWith("image/") ?? /\.(png|jpe?g|gif|webp|svg)$/i.test(attachment.name));
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
