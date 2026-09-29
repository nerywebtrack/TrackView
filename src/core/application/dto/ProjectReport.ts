import type { ColumnKind } from "@/core/domain/entities/BoardColumn";
import type { Priority } from "@/core/domain/entities/Task";
import type { TaskActivityAction } from "@/core/domain/entities/TaskActivity";

export type ReportPerson = { id: string; name: string; email?: string };

export type ReportColumn = { id: string; name: string; kind: ColumnKind; position: number };

export type ReportTask = {
  id: string;
  title: string;
  description: string;
  priority: Priority | null;
  tags: string[];
  status: ReportColumn | null;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string | null;
  createdBy: ReportPerson | null;
  startDate: string | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  assignees: ReportPerson[];
  commentsCount: number;
  attachmentsCount: number;
};

export type ReportPeriod = {
  taskId: string;
  columnId: string;
  columnName: string;
  columnKind: ColumnKind | null;
  enteredAt: string;
  leftAt: string | null;
  seconds: number;
};

export type ReportEvent = {
  id: number;
  taskId: string;
  taskTitle: string;
  action: TaskActivityAction;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  fromColumnName: string | null;
  toColumnName: string | null;
  actor: ReportPerson | null;
  createdAt: string;
};

export type ProjectReport = {
  generatedAt: string;
  project: { id: string; name: string };
  columns: ReportColumn[];
  members: ReportPerson[];
  tasks: ReportTask[];
  periods: ReportPeriod[];
  events: ReportEvent[];
};
