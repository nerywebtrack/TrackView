import type { User } from "@/core/domain/entities/User";
import type { Workspace } from "@/core/domain/entities/Workspace";
import Avatar from "@/presentation/components/ui/Avatar";
import {
  CalendarIcon,
  CollapseIcon,
  DashboardIcon,
  LogoIcon,
  LogoutIcon,
  ProjectsIcon,
  ReportsIcon,
  SettingsIcon,
  TeamIcon,
} from "@/presentation/components/ui/Icons";

const navItems = [
  { label: "Dashboard", icon: DashboardIcon },
  { label: "Projects", icon: ProjectsIcon, active: true },
  { label: "Calendar", icon: CalendarIcon },
  { label: "Team", icon: TeamIcon },
  { label: "Reports", icon: ReportsIcon },
  { label: "Settings", icon: SettingsIcon },
];

type SidebarProps = {
  workspace: Workspace;
  members: User[];
  managerId?: string;
  currentUserId: string;
  collapsed: boolean;
  activeItem: string;
  onCollapse: () => void;
  onNavigate: (item: string) => void;
  isOwner: boolean;
  onLogout: () => void;
  onContacts: () => void;
};

export default function Sidebar({ workspace, members, managerId, currentUserId, collapsed, activeItem, isOwner, onCollapse, onNavigate, onLogout, onContacts }: SidebarProps) {
  const visibleItems = isOwner ? navItems : navItems.filter((item) => item.label === "Projects");
  return (
    <aside className={`hidden shrink-0 flex-col rounded-3xl bg-white p-4 shadow-sm transition-all md:flex ${collapsed ? "w-[76px]" : "w-[232px]"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoIcon width={30} height={30} />
          <div className={`leading-tight ${collapsed ? "hidden" : "block"}`}>
            <p className="text-[15px] font-semibold italic text-slate-900">
              Scopeboard
              <sup className="ml-0.5 text-[8px] not-italic">®</sup>
            </p>
            <p className="text-[8px] font-medium tracking-[0.14em] text-slate-400">
              PROJECT MANAGEMENT
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Colapsar menú"
          onClick={onCollapse}
          className="text-slate-400 transition hover:text-slate-600"
        >
          <CollapseIcon />
        </button>
      </div>

      <nav className="mt-6 flex flex-col gap-1">
        {visibleItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            title={collapsed ? label : undefined}
            onClick={() => onNavigate(label)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activeItem === label
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon />
            {!collapsed && label}
          </button>
        ))}
      </nav>

      <div className={`mt-6 border-t border-slate-100 pt-5 ${collapsed ? "hidden" : "block"}`}>
        <p className="flex items-center justify-between text-[10px] font-semibold tracking-[0.14em] text-slate-400">
          PROJECT MEMBERS
          <span className="rounded-full bg-slate-100 px-2 py-0.5 tracking-normal text-slate-500">{members.length}</span>
        </p>
        <ul className="mt-3 flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-1">
          {members.map((user) => (
            <li key={user.id} className="flex items-center gap-3">
              <span className="relative">
                <Avatar user={user} size={32} />
                {user.id === managerId && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400" title="Dueño del proyecto" />}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-slate-800">
                  {user.name}
                  {user.id === currentUserId && <span className="ml-1 text-[11px] font-normal text-slate-400">(tú)</span>}
                </p>
                <p className="truncate text-[11px] text-slate-400">{user.id === managerId ? "Owner" : user.email ?? "Member"}</p>
              </div>
            </li>
          ))}
          {members.length === 0 && <li className="text-xs text-slate-400">Todavía no hay miembros.</li>}
        </ul>
      </div>

      <div className={`mt-auto pt-6 ${collapsed ? "hidden" : "block"}`}>
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow-sm">
            {workspace.initial}
          </span>
          <div className="leading-tight">
            <p className="text-[11px] text-slate-400">{workspace.label}</p>
            <p className="text-sm font-semibold text-slate-800">
              {workspace.name}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-semibold tracking-wide text-slate-400">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 transition hover:text-slate-600"
          >
            <LogoutIcon width={14} height={14} />
            LOG OUT
          </button>
          <button type="button" onClick={onContacts} className="transition hover:text-slate-600">
            CONTACTS
          </button>
        </div>
      </div>
    </aside>
  );
}
