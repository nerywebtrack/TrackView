import type { User } from "@/core/domain/entities/User";
import Avatar from "@/presentation/components/ui/Avatar";
import {
  BellIcon,
  ChatIcon,
  FlagIcon,
  SearchIcon,
} from "@/presentation/components/ui/Icons";

type TopbarProps = {
  currentUser: User;
  query: string;
  onQueryChange: (query: string) => void;
  onAction: (action: "flags" | "messages" | "notifications" | "profile") => void;
};

export default function Topbar({ currentUser, query, onQueryChange, onAction }: TopbarProps) {
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
        <button type="button" onClick={() => onAction("profile")} className="relative" aria-label="Abrir perfil">
          <Avatar user={currentUser} size={34} />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
        </button>
      </div>
    </header>
  );
}
