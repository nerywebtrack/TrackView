"use client";

import { useRef, useState } from "react";
import type { Priority } from "@/core/domain/entities/Task";
import type { User } from "@/core/domain/entities/User";
import Avatar from "@/presentation/components/ui/Avatar";
import { ImageIcon, LinkIcon, PaperclipIcon, SmileIcon, TrashIcon } from "@/presentation/components/ui/Icons";
import { AssigneePicker, Divider, EMOJIS, Menu, OutlineButton, StatusPicker, TabButton, TicketField, ToolButton, formatBytes, safeHostname } from "./ticketParts";

export type NewTaskInput = {
  columnId: string;
  title: string;
  description: string;
  priority: Priority;
  assignees: User[];
  startDate?: string;
  dueDate: string;
  tags: string[];
  files: File[];
  links: string[];
};

type Tab = "details" | "attachments";
type Popover = "status" | "emoji" | "assignee";

const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };
const controlClass = "h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-[15px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export default function TaskCreateForm({ columns, initialColumnId, team, manager, currentUser, connected, onCreate, onCancel, onToast }: {
  columns: Array<{ id: string; name: string }>;
  initialColumnId: string;
  team: User[];
  manager: User;
  currentUser: User;
  connected: boolean;
  onCreate: (input: NewTaskInput) => void;
  onCancel: () => void;
  onToast: (message: string) => void;
}) {
  const [columnId, setColumnId] = useState(initialColumnId);
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => [team.some((user) => user.id === currentUser.id) ? currentUser.id : team[0]?.id].filter((id): id is string => Boolean(id)));
  const [startDate, setStartDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkForm, setLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [tab, setTab] = useState<Tab>("details");
  const [popover, setPopover] = useState<Popover | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const attachmentCount = files.length + links.length;

  function togglePopover(name: Popover) {
    setPopover((current) => (current === name ? null : name));
  }

  function toggleAssignee(userId: string) {
    const selected = assigneeIds.includes(userId);
    if (selected && assigneeIds.length === 1) {
      onToast("El ticket necesita al menos una persona asignada");
      return;
    }
    setAssigneeIds(selected ? assigneeIds.filter((id) => id !== userId) : [...assigneeIds, userId]);
  }

  function pickFiles(input: React.RefObject<HTMLInputElement | null>) {
    if (!connected) {
      onToast("Inicia sesión (con Supabase activo) para adjuntar archivos.");
      return;
    }
    input.current?.click();
  }

  function queueFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    setFiles((current) => [...current, ...selected]);
    setTab("attachments");
  }

  function addLink(event: { preventDefault: () => void }) {
    event.preventDefault();
    const value = linkUrl.trim();
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    } catch {
      onToast("El enlace debe empezar con http:// o https://");
      return;
    }
    setLinks((current) => [...current, value]);
    setLinkUrl("");
    setLinkForm(false);
  }

  function insertEmoji(emoji: string) {
    setPopover(null);
    setTab("details");
    setDescription((current) => current + emoji);
    window.setTimeout(() => descriptionRef.current?.focus(), 0);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError("Escribe un nombre para el ticket");
      titleRef.current?.focus();
      return;
    }
    if (startDate && dueDate && startDate > dueDate) {
      onToast("La fecha de inicio no puede ser posterior a la fecha final");
      return;
    }
    onCreate({
      columnId,
      title: title.trim(),
      description: description.trim(),
      priority,
      assignees: assigneeIds.flatMap((id) => team.filter((user) => user.id === id)),
      startDate: startDate || undefined,
      dueDate: dueDate || today(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      files,
      links,
    });
  }

  return (
    <form onSubmit={submit} noValidate className="text-slate-800">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={queueFiles} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={queueFiles} />

      <header className="flex items-center justify-between gap-4 border-b border-slate-200/80 px-6 py-5">
        <h2 id="dialog-title" className="text-[22px] font-semibold tracking-tight text-slate-800">Project Ticket</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} title="Cerrar sin crear" className="h-11 rounded-xl border border-slate-200 px-5 text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50">Draft</button>
          <button type="submit" className="h-11 rounded-xl bg-[#0aa5f5] px-5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#0894dc]">Save Ticket</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-5">
        <StatusPicker columns={columns} value={columnId} label="Crear en" open={popover === "status"} onToggle={() => togglePopover("status")} onClose={() => setPopover(null)} onChange={setColumnId} />
        <div className="flex items-center gap-1">
          <ToolButton title="Adjuntar archivo" onClick={() => pickFiles(fileInputRef)}><PaperclipIcon width={21} height={21} /></ToolButton>
          <div className="relative">
            <ToolButton title="Insertar emoji en el detalle" active={popover === "emoji"} onClick={() => togglePopover("emoji")}><SmileIcon width={21} height={21} /></ToolButton>
            {popover === "emoji" && (
              <Menu className="right-0 w-60" onClose={() => setPopover(null)}>
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="h-9 rounded-lg text-lg transition hover:bg-slate-100">{emoji}</button>)}
                </div>
              </Menu>
            )}
          </div>
          <Divider />
          <ToolButton title="Agregar enlace" onClick={() => { setTab("attachments"); setLinkForm(true); }}><LinkIcon width={21} height={21} /></ToolButton>
          <ToolButton title="Subir imagen" onClick={() => pickFiles(imageInputRef)}><ImageIcon width={21} height={21} /></ToolButton>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-6 px-6 py-6 sm:grid-cols-2">
        <TicketField label="Project name">
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => { setTitle(event.target.value); if (titleError) setTitleError(""); }}
            autoFocus
            maxLength={120}
            placeholder="Nombre de la tarea"
            aria-label="Nombre de la tarea"
            aria-invalid={Boolean(titleError)}
            className={`${controlClass} font-semibold ${titleError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
          />
          {titleError && <p className="mt-1.5 text-xs text-red-600">{titleError}</p>}
        </TicketField>

        <TicketField label="Project Manager">
          <div className="flex h-11 items-center gap-3">
            <Avatar user={manager} size={36} />
            <span className="truncate text-[16px] font-semibold text-slate-800">{manager.name}</span>
          </div>
        </TicketField>

        <TicketField label="Assigned to">
          <div className="flex h-11 items-center">
            <AssigneePicker options={team} selectedIds={assigneeIds} open={popover === "assignee"} onToggle={() => togglePopover("assignee")} onClose={() => setPopover(null)} onSelect={toggleAssignee} subtitleOf={(user) => user.email ?? (user.role === "owner" ? "Project Owner" : "Member")} />
          </div>
        </TicketField>

        <TicketField label="Timeline">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={startDate} max={dueDate || undefined} onChange={(event) => setStartDate(event.target.value)} aria-label="Fecha de inicio" className={`${controlClass} px-2.5 text-sm`} />
            <input type="date" value={dueDate} min={startDate || undefined} onChange={(event) => setDueDate(event.target.value)} aria-label="Fecha final" className={`${controlClass} px-2.5 text-sm`} />
          </div>
        </TicketField>
      </div>

      <div className="border-b border-slate-200/80 px-6">
        <div role="tablist" className="flex gap-8">
          <TabButton active={false} disabled title="Los comentarios se habilitan cuando el ticket ya existe" onClick={() => undefined}>Comments</TabButton>
          <TabButton active={tab === "details"} onClick={() => setTab("details")}>Details</TabButton>
          <TabButton active={tab === "attachments"} onClick={() => setTab("attachments")}>
            Attachment
            {attachmentCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-white">{attachmentCount}</span>}
          </TabButton>
        </div>
      </div>

      {tab === "details" && (
        <div className="space-y-5 px-6 py-6">
          <TicketField label="Description">
            <textarea ref={descriptionRef} value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Describe el objetivo, criterios de aceptación o cualquier detalle útil…" className="block w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100" />
          </TicketField>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <TicketField label="Priority">
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} aria-label="Prioridad" className={`${controlClass} font-semibold`}>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => <option key={value} value={value}>{PRIORITY_LABEL[value]}</option>)}
              </select>
            </TicketField>
            <TicketField label="Tags">
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Diseño, Backend" aria-label="Etiquetas separadas por coma" className={controlClass} />
            </TicketField>
          </div>
        </div>
      )}

      {tab === "attachments" && (
        <div className="px-6 py-6">
          <div className="flex flex-wrap gap-2">
            <OutlineButton onClick={() => pickFiles(fileInputRef)}><PaperclipIcon width={17} height={17} />Subir archivo</OutlineButton>
            <OutlineButton onClick={() => pickFiles(imageInputRef)}><ImageIcon width={17} height={17} />Subir imagen</OutlineButton>
            <OutlineButton onClick={() => setLinkForm(true)}><LinkIcon width={17} height={17} />Agregar enlace</OutlineButton>
          </div>
          {linkForm && (
            <div className="mt-4 flex flex-wrap gap-2">
              <input type="url" autoFocus value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addLink(event); }} placeholder="https://" aria-label="Enlace" className={`${controlClass} flex-1 text-sm`} />
              <button type="button" onClick={addLink} className="h-11 rounded-xl bg-[#0aa5f5] px-4 text-sm font-semibold text-white hover:bg-[#0894dc]">Agregar</button>
              <button type="button" onClick={() => { setLinkForm(false); setLinkUrl(""); }} className="h-11 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
            </div>
          )}
          {attachmentCount === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Todavía no agregaste archivos ni enlaces.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {files.map((file, index) => (
                <QueuedItem key={`${file.name}-${index}`} icon={file.type.startsWith("image/") ? <ImageIcon width={18} height={18} /> : <PaperclipIcon width={18} height={18} />} name={file.name} meta={formatBytes(file.size)} onRemove={() => setFiles((current) => current.filter((_, position) => position !== index))} />
              ))}
              {links.map((link, index) => (
                <QueuedItem key={`${link}-${index}`} icon={<LinkIcon width={18} height={18} />} name={safeHostname(link)} meta={link} onRemove={() => setLinks((current) => current.filter((_, position) => position !== index))} />
              ))}
            </ul>
          )}
          {files.length > 0 && <p className="mt-3 text-xs text-slate-400">Los archivos se subirán al bucket de Supabase en cuanto se cree el ticket.</p>}
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-6 py-4">
        <p className="text-xs text-slate-400">{attachmentCount > 0 ? `${attachmentCount} ${attachmentCount === 1 ? "adjunto listo" : "adjuntos listos"} para subir` : "Puedes editar todo después desde el ticket."}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100">Cancelar</button>
          <button type="submit" className="h-10 rounded-xl bg-[#0aa5f5] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0894dc]">Crear tarea</button>
        </div>
      </footer>
    </form>
  );
}

function QueuedItem({ icon, name, meta, onRemove }: { icon: React.ReactNode; name: string; meta: string; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{name}</span>
        <span className="block truncate text-xs text-slate-400">{meta}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Quitar ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><TrashIcon width={17} height={17} /></button>
    </li>
  );
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
