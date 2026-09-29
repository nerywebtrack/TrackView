import type { BoardColumn } from "@/core/domain/entities/BoardColumn";
import ColumnView from "./ColumnView";

type BoardProps = {
  columns: BoardColumn[];
  dropTargetId: string | null;
  onAddTask: (columnId: string) => void;
  onTaskAction: (taskId: string, columnId: string) => void;
  onDragStart: (taskId: string, columnId: string) => void;
  onDragEnd: () => void;
  onDragOver: (columnId: string) => void;
  onDrop: (columnId: string) => void;
};

export default function Board({ columns, dropTargetId, onAddTask, onTaskAction, onDragStart, onDragEnd, onDragOver, onDrop }: BoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => (
        <ColumnView key={column.id} column={column} isDropTarget={dropTargetId === column.id} onAddTask={onAddTask} onTaskAction={onTaskAction} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} />
      ))}
    </div>
  );
}
