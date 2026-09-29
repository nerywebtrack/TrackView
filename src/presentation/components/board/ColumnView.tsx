import type { BoardColumn } from "@/core/domain/entities/BoardColumn";
import TaskCard from "./TaskCard";
import { PlusIcon } from "@/presentation/components/ui/Icons";

type ColumnViewProps = {
  column: BoardColumn;
  isDropTarget: boolean;
  onAddTask: (columnId: string) => void;
  onTaskAction: (taskId: string, columnId: string) => void;
  onDragStart: (taskId: string, columnId: string) => void;
  onDragEnd: () => void;
  onDragOver: (columnId: string) => void;
  onDrop: (columnId: string) => void;
};

export default function ColumnView({ column, isDropTarget, onAddTask, onTaskAction, onDragStart, onDragEnd, onDragOver, onDrop }: ColumnViewProps) {
  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver(column.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(column.id);
      }}
      className={`flex min-h-48 w-[268px] shrink-0 flex-col gap-3 rounded-3xl p-3 transition ${isDropTarget ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-slate-50/70"}`}
    >
      <header className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          {column.name}
          <span className="text-sm font-medium text-slate-400">
            {column.totalCount}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => onAddTask(column.id)}
          aria-label={`Agregar tarea en ${column.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-slate-600"
        >
          <PlusIcon width={16} height={16} />
        </button>
      </header>

      <div className="flex flex-col gap-3">
        {column.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onAction={() => onTaskAction(task.id, column.id)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", task.id);
              onDragStart(task.id, column.id);
            }}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </section>
  );
}
