import { assigneesOf, type Task } from "@/core/domain/entities/Task";
import Avatar from "@/presentation/components/ui/Avatar";
import AvatarGroup from "@/presentation/components/ui/AvatarGroup";
import {
  CalendarIcon,
  MoreIcon,
  PaperclipIcon,
  TagIcon,
} from "@/presentation/components/ui/Icons";
import PriorityBadge from "@/presentation/components/ui/PriorityBadge";
import { cn } from "@/lib/utils";

type TaskCardProps = {
  task: Task;
  onAction: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

export default function TaskCard({ task, onAction, onDragStart, onDragEnd }: TaskCardProps) {
  const assignees = assigneesOf(task);
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-3xl bg-white shadow-sm transition hover:shadow-md active:cursor-grabbing",
        task.highlighted && "ring-2 ring-fuchsia-500",
      )}
    >
      <div className="flex items-start justify-between pr-3">
        <PriorityBadge priority={task.priority} />
        <button
          type="button"
          onClick={onAction}
          aria-label="Más opciones"
          className="mt-2 text-slate-300 transition hover:text-slate-500"
        >
          <MoreIcon />
        </button>
      </div>

      <div className="px-4 pb-3 pt-1">
        <h3 className="text-[15px] font-semibold text-slate-900">
          {task.title}
        </h3>

        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          {assignees.length > 1 ? (
            <span className="flex items-center gap-1.5" title={assignees.map((user) => user.name).join(", ")}>
              <AvatarGroup users={assignees.slice(0, 3)} extra={assignees.length - 3} size={20} />
              {assignees.length} people
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Avatar user={task.assignee} size={20} />
              {task.assignee.name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <CalendarIcon width={14} height={14} className="text-slate-400" />
            {task.dueDate}
          </span>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          {task.description}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <PaperclipIcon width={14} height={14} className="text-slate-400" />
          {task.filesCount} files
        </span>
        <span className="flex items-center gap-1.5 truncate">
          <TagIcon width={14} height={14} className="text-slate-400" />
          {task.tags.join(", ")}
        </span>
      </div>
    </article>
  );
}
