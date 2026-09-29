import type { Project } from "@/core/domain/entities/Project";
import AvatarGroup from "@/presentation/components/ui/AvatarGroup";
import ProgressBar from "@/presentation/components/ui/ProgressBar";
import {
  ChevronDownIcon,
  FilterIcon,
  MegaphoneIcon,
  PlusIcon,
  SortIcon,
} from "@/presentation/components/ui/Icons";

type ProjectHeaderProps = {
  project: Project;
  progress: number;
  priorityFilter: string;
  sortBy: string;
  groupBy: string;
  onPriorityFilter: () => void;
  onSort: () => void;
  onGroup: () => void;
  onAddColumn: () => void;
  onSubtitle: () => void;
};

export default function ProjectHeader({
  project,
  progress,
  priorityFilter,
  sortBy,
  groupBy,
  onPriorityFilter,
  onSort,
  onGroup,
  onAddColumn,
  onSubtitle,
}: ProjectHeaderProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex items-center gap-2 text-sm">
          <span className="rounded-lg px-2 py-1 text-slate-500">Projects</span>
          <span className="text-slate-300">/</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 font-medium text-slate-700">
            {project.name}
          </span>
        </nav>

        <div className="flex items-center gap-6">
          <AvatarGroup users={project.members} extra={project.extraMembers} />
          <div className="w-[230px]">
            <p className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-slate-400">
              PROGRESS: {progress}%
            </p>
            <ProgressBar value={progress} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <MegaphoneIcon width={24} height={24} />
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {project.name}
              </h1>
              <span className="rounded-md bg-fuchsia-50 px-2 py-1 text-[10px] font-semibold tracking-wide text-fuchsia-600">
                {project.visibility === "public" ? "PUBLIC" : "PRIVATE"}
              </span>
            </div>
            <button
              type="button"
              onClick={onSubtitle}
              className="mt-1 flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700"
            >
              {project.subtitle}
              <ChevronDownIcon width={14} height={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ToolbarButton onClick={onPriorityFilter} icon={<FilterIcon width={16} height={16} />}>
            {priorityFilter === "all" ? "Filter" : priorityFilter}
          </ToolbarButton>
          <ToolbarButton onClick={onSort} icon={<SortIcon width={16} height={16} />}>
            {sortBy === "default" ? "Sorted by" : sortBy}
          </ToolbarButton>
          <ToolbarButton onClick={onGroup} icon={<ChevronDownIcon width={16} height={16} />}>
            {groupBy === "none" ? "Group by" : groupBy}
          </ToolbarButton>
          <button
            type="button"
            onClick={onAddColumn}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            <PlusIcon width={16} height={16} />
            Add new column
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
    >
      {icon}
      {children}
    </button>
  );
}
