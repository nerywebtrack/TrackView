"use client";

import type { Attachment } from "@/core/domain/entities/Attachment";
import type { User } from "@/core/domain/entities/User";
import Avatar from "@/presentation/components/ui/Avatar";
import { CheckCircleIcon, ChevronDownIcon, PlusIcon } from "@/presentation/components/ui/Icons";

export const EMOJIS = ["👍", "🎉", "🔥", "✅", "👀", "🙏", "😄", "❤️", "🚀", "💡", "⚠️", "📌"];

export function StatusPicker({ columns, value, open, onToggle, onClose, onChange, label = "Mover a" }: { columns: Array<{ id: string; name: string }>; value: string; open: boolean; onToggle: () => void; onClose: () => void; onChange: (columnId: string) => void; label?: string }) {
  const current = columns.find((column) => column.id === value)?.name ?? "Sin estado";
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-haspopup="listbox" aria-expanded={open} aria-label={`Estado: ${current}`} className="flex h-12 items-center gap-2.5 rounded-xl border border-slate-200 pl-4 pr-3 text-[16px] font-medium text-slate-800 transition hover:bg-slate-50">
        <CheckCircleIcon className="text-green-500" />
        {current}
        <ChevronDownIcon width={16} height={16} className="text-slate-400" />
      </button>
      {open && (
        <Menu className="left-0 w-56" onClose={onClose}>
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          {columns.map((column) => (
            <MenuItem key={column.id} active={column.id === value} onClick={() => { onClose(); if (column.id !== value) onChange(column.id); }}>
              {column.name}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}

export function AssigneePicker({ options, selectedIds, open, onToggle, onClose, onSelect, subtitleOf }: { options: User[]; selectedIds: string[]; open: boolean; onToggle: () => void; onClose: () => void; onSelect: (userId: string) => void; subtitleOf: (user: User) => string }) {
  const selected = selectedIds.flatMap((id) => options.filter((user) => user.id === id));
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-haspopup="listbox" aria-expanded={open} title={selected.length ? `Asignado a ${selected.map((user) => user.name).join(", ")}` : "Asignar personas"} className="flex items-center rounded-full">
        {selected.slice(0, 4).map((user) => <Avatar key={user.id} user={user} size={40} className="-ml-2.5 first:ml-0" />)}
        {selected.length > 4 && <span className="-ml-2.5 grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white">+{selected.length - 4}</span>}
        <span className={`${selected.length ? "-ml-2.5" : ""} grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 ring-2 ring-white transition hover:border-sky-400 hover:text-sky-500`}><PlusIcon width={16} height={16} /></span>
      </button>
      {open && (
        <Menu className="left-0 w-72" onClose={onClose}>
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Asignar personas</p>
          <div className="max-h-64 overflow-y-auto">
            {options.map((user) => {
              const checked = selectedIds.includes(user.id);
              return (
                <button key={user.id} type="button" role="menuitemcheckbox" aria-checked={checked} onClick={() => onSelect(user.id)} className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 ${checked ? "bg-sky-50" : ""}`}>
                  <Avatar user={user} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{user.name}</span>
                    <span className="block truncate text-xs text-slate-400">{subtitleOf(user)}</span>
                  </span>
                  {checked && <CheckCircleIcon width={18} height={18} className="text-sky-500" />}
                </button>
              );
            })}
          </div>
        </Menu>
      )}
    </div>
  );
}

export function TicketField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="mb-3 text-[15px] text-slate-400">{label}</p>{children}</div>;
}

export function TabButton({ active, onClick, disabled = false, title, children }: { active: boolean; onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} disabled={disabled} title={title} onClick={onClick} className={`relative flex items-center gap-2 pb-4 pt-1 text-[16px] transition disabled:cursor-not-allowed disabled:text-slate-300 ${active ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
      {children}
      {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-amber-400" aria-hidden="true" />}
    </button>
  );
}

export function ToolButton({ title, onClick, active = false, danger = false, children }: { title: string; onClick: () => void; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  const tone = danger ? "text-red-600 hover:bg-red-50" : active ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700";
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`grid h-10 w-10 place-items-center rounded-lg transition ${tone}`}>{children}</button>;
}

export function OutlineButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">{children}</button>;
}

export function Divider() {
  return <span className="mx-1.5 h-6 w-px bg-slate-200" aria-hidden="true" />;
}

export function Menu({ className = "", onClose, children }: { className?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-20" aria-hidden="true" onMouseDown={onClose} />
      <div role="menu" className={`absolute top-full z-30 mt-2 rounded-xl border border-slate-100 bg-white p-1.5 text-sm shadow-xl ${className}`}>{children}</div>
    </>
  );
}

export function MenuItem({ active = false, danger = false, onClick, children }: { active?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-medium transition ${danger ? "text-red-600 hover:bg-red-50" : active ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50"}`}>
      {children}
      {active && <CheckCircleIcon width={16} height={16} className="text-sky-500" />}
    </button>
  );
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

export function isImage(attachment: Pick<Attachment, "kind" | "contentType" | "name">) {
  return attachment.kind === "file" && (attachment.contentType?.startsWith("image/") ?? /\.(png|jpe?g|gif|webp|svg)$/i.test(attachment.name));
}

export function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
