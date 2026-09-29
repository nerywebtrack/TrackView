"use client";

import { useState } from "react";
import type { User } from "@/core/domain/entities/User";
import Avatar from "@/presentation/components/ui/Avatar";
import {
  BellIcon,
  ChatIcon,
  FlagIcon,
  LogoutIcon,
  SearchIcon,
} from "@/presentation/components/ui/Icons";

type TopbarProps = {
  currentUser: User;
  query: string;
  onQueryChange: (query: string) => void;
  onAction: (action: "flags" | "messages" | "notifications" | "profile") => void;
  onLogout: () => void;
};

export default function Topbar({ currentUser, query, onQueryChange, onAction, onLogout }: TopbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="flex items-center gap-4 rounded-3xl bg-white px-5 py-3 shadow-sm">
      <SearchIcon className="text-slate-400" width={20} height={20} />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label="Buscar tareas, proyectos o personas"
        placeholder="Search tasks, projects, people..."
        className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
      />
      <div className="flex items-center gap-4 text-slate-400">
        <button type="button" aria-label="Pendientes" onClick={() => onAction("flags")} className="hover:text-slate-600">
          <FlagIcon width={20} height={20} />
        </button>
        <button type="button" aria-label="Mensajes" onClick={() => onAction("messages")} className="hover:text-slate-600">
          <ChatIcon width={20} height={20} />
        </button>
        <button
          type="button"
          aria-label="Notificaciones"
          onClick={() => onAction("notifications")}
          className="hover:text-slate-600"
        >
          <BellIcon width={20} height={20} />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-300"
            aria-label="Abrir menú de usuario"
            aria-expanded={profileOpen}
          >
            <Avatar user={currentUser} size={34} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-30 w-60 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="truncate text-sm font-semibold text-slate-800">{currentUser.name}</p>
                {currentUser.email && <p className="truncate text-xs text-slate-400">{currentUser.email}</p>}
              </div>
              <button
                type="button"
                onClick={() => { setProfileOpen(false); onLogout(); }}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <LogoutIcon width={17} height={17} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
