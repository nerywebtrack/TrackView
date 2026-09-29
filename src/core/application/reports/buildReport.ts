import type { ProjectReport, ReportPeriod, ReportPerson, ReportTask } from "@/core/application/dto/ProjectReport";

export const REPORT_TIME_ZONE = "America/Guatemala";
export const UNASSIGNED_ID = "__unassigned__";

export type RangeMode = "activity" | "created" | "completed";
export type TimeUnit = "hours" | "days";
export type CellValue = string | number | Date | null;
export type Sheet = { name: string; headers: string[]; rows: CellValue[][]; kinds: Array<"text" | "date" | "datetime" | "number" | "duration"> };

export type ReportFilters = {
  from: string | null;
  to: string | null;
  mode: RangeMode;
  personIds: string[];
  statusIds: string[];
  includeDeleted: boolean;
};

export const FIELD_DEFS = [
  { key: "title", label: "Nombre de la tarea", group: "Tarea" },
  { key: "description", label: "Descripción", group: "Tarea" },
  { key: "status", label: "Estado actual", group: "Tarea" },
  { key: "statusKind", label: "Tipo de estado", group: "Tarea" },
  { key: "priority", label: "Prioridad", group: "Tarea" },
  { key: "tags", label: "Etiquetas", group: "Tarea" },
  { key: "id", label: "ID de la tarea", group: "Tarea" },
  { key: "assignees", label: "Persona asignada", group: "Personas" },
  { key: "assigneeEmail", label: "Correo de la persona", group: "Personas" },
  { key: "createdBy", label: "Creada por", group: "Personas" },
  { key: "createdAt", label: "Fecha de creación", group: "Fechas" },
  { key: "startDate", label: "Fecha de inicio (planificada)", group: "Fechas" },
  { key: "dueDate", label: "Fecha de fin (planificada)", group: "Fechas" },
  { key: "startedAt", label: "Inicio real del trabajo", group: "Fechas" },
  { key: "completedAt", label: "Fecha de finalización", group: "Fechas" },
  { key: "deletedAt", label: "Fecha de eliminación", group: "Fechas" },
  { key: "cycleTime", label: "Tiempo de trabajo (en curso → terminado)", group: "Tiempos" },
  { key: "leadTime", label: "Tiempo total (creación → terminado)", group: "Tiempos" },
  { key: "commentsCount", label: "Comentarios", group: "Otros" },
  { key: "attachmentsCount", label: "Adjuntos", group: "Otros" },
  { key: "deleted", label: "¿Eliminada?", group: "Otros" },
] as const;

export type FieldKey = (typeof FIELD_DEFS)[number]["key"];

export type ExportConfig = {
  fields: FieldKey[];
  stateTimes: boolean;
  rowMode: "task" | "person";
  timeUnit: TimeUnit;
  sheets: { summary: boolean; daily: boolean; periods: boolean; history: boolean };
};

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  fields: ["title", "status", "priority", "assignees", "createdAt", "startDate", "dueDate", "startedAt", "completedAt", "cycleTime", "leadTime"],
  stateTimes: true,
  rowMode: "person",
  timeUnit: "hours",
  sheets: { summary: true, daily: true, periods: true, history: true },
};

const PRIORITY_LABEL = { low: "Baja", medium: "Media", high: "Alta" } as const;
const KIND_LABEL = { todo: "Pendiente", active: "En curso", done: "Terminado" } as const;

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFormatter = new Intl.DateTimeFormat("en-US", { timeZone: REPORT_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** YYYY-MM-DD of an instant, in Guatemala time. */
export function dayKey(iso: string) {
  return dayFormatter.format(new Date(iso));
}

/**
 * A Date whose UTC fields equal the Guatemala wall-clock time of `iso`.
 * Spreadsheets have no time zones: this makes Excel show local time.
 */
export function toLocalWallClock(iso: string | null): Date | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)));
}

export function inRange(day: string | null, filters: Pick<ReportFilters, "from" | "to">) {
  if (!day) return false;
  if (filters.from && day < filters.from) return false;
  if (filters.to && day > filters.to) return false;
  return true;
}

function secondsBetween(from: string | null, to: string | null) {
  if (!from || !to) return null;
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000);
}

export function cycleSeconds(task: ReportTask) {
  return secondsBetween(task.startedAt, task.completedAt);
}

export function leadSeconds(task: ReportTask) {
  return secondsBetween(task.createdAt, task.completedAt);
}

function personIdsOf(task: ReportTask) {
  return task.assignees.length ? task.assignees.map((person) => person.id) : [UNASSIGNED_ID];
}

export function filterTasks(report: ProjectReport, filters: ReportFilters): ReportTask[] {
  const activeDays = new Map<string, string[]>();
  report.events.forEach((event) => {
    const days = activeDays.get(event.taskId) ?? [];
    days.push(dayKey(event.createdAt));
    activeDays.set(event.taskId, days);
  });
  const hasRange = Boolean(filters.from || filters.to);

  return report.tasks.filter((task) => {
    if (task.deleted && !filters.includeDeleted) return false;
    if (filters.statusIds.length && !task.deleted && !filters.statusIds.includes(task.status?.id ?? "")) return false;
    if (filters.personIds.length && !personIdsOf(task).some((id) => filters.personIds.includes(id))) return false;
    if (!hasRange) return true;
    if (filters.mode === "created") return inRange(task.createdAt ? dayKey(task.createdAt) : null, filters);
    if (filters.mode === "completed") return inRange(task.completedAt ? dayKey(task.completedAt) : null, filters);
    return (activeDays.get(task.id) ?? []).some((day) => inRange(day, filters)) || inRange(task.createdAt ? dayKey(task.createdAt) : null, filters);
  });
}

/** Every person who appears anywhere in the report, members first. */
export function peopleOf(report: ProjectReport): ReportPerson[] {
  const people = new Map<string, ReportPerson>();
  report.members.forEach((person) => people.set(person.id, person));
  report.tasks.forEach((task) => task.assignees.forEach((person) => people.has(person.id) || people.set(person.id, person)));
  return [...people.values()];
}

/** All states that ever held a task, current ones first (in board order). */
export function statesOf(report: ProjectReport) {
  const states = new Map(report.columns.map((column) => [column.id, column.name]));
  report.periods.forEach((period) => states.has(period.columnId) || states.set(period.columnId, `${period.columnName} (eliminado)`));
  return [...states].map(([id, name]) => ({ id, name }));
}

export function secondsByState(periods: ReportPeriod[]) {
  const totals = new Map<string, number>();
  periods.forEach((period) => totals.set(period.columnId, (totals.get(period.columnId) ?? 0) + period.seconds));
  return totals;
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export type PersonSummary = { person: ReportPerson; assigned: number; completed: number; inProgress: number; avgCycle: number | null; avgLead: number | null };

export function computeMetrics(report: ProjectReport, tasks: ReportTask[], filters: ReportFilters) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const completedInRange = tasks.filter((task) => task.completedAt && inRange(dayKey(task.completedAt), filters));
  const createdInRange = tasks.filter((task) => task.createdAt && inRange(dayKey(task.createdAt), filters));

  // Each time a task enters a "done" state from a non-done one is one completion.
  const completionsByDay = new Map<string, number>();
  const periodsByTask = new Map<string, ReportPeriod[]>();
  report.periods.forEach((period) => {
    if (!taskIds.has(period.taskId)) return;
    const list = periodsByTask.get(period.taskId) ?? [];
    list.push(period);
    periodsByTask.set(period.taskId, list);
  });
  periodsByTask.forEach((list) => list.forEach((period, index) => {
    if (period.columnKind !== "done" || list[index - 1]?.columnKind === "done") return;
    const day = dayKey(period.enteredAt);
    if (inRange(day, filters)) completionsByDay.set(day, (completionsByDay.get(day) ?? 0) + 1);
  }));

  const people = [...peopleOf(report), { id: UNASSIGNED_ID, name: "Sin asignar" }];
  const perPerson: PersonSummary[] = people
    .map((person) => {
      const mine = tasks.filter((task) => personIdsOf(task).includes(person.id));
      const done = completedInRange.filter((task) => personIdsOf(task).includes(person.id));
      return {
        person,
        assigned: mine.length,
        completed: done.length,
        inProgress: mine.filter((task) => task.status?.kind === "active").length,
        avgCycle: average(done.map(cycleSeconds)),
        avgLead: average(done.map(leadSeconds)),
      };
    })
    .filter((row) => row.assigned > 0 && (!filters.personIds.length || filters.personIds.includes(row.person.id)));

  const stateTotals = statesOf(report).map((state) => {
    const visits = [...periodsByTask.values()].map((list) => list.filter((period) => period.columnId === state.id)).filter((list) => list.length);
    return { ...state, tasks: visits.length, avgSeconds: average(visits.map((list) => list.reduce((sum, period) => sum + period.seconds, 0))) };
  }).filter((state) => state.tasks > 0);

  return {
    created: createdInRange.length,
    completed: completedInRange.length,
    inProgressNow: tasks.filter((task) => task.status?.kind === "active").length,
    avgCycle: average(completedInRange.map(cycleSeconds)),
    avgLead: average(completedInRange.map(leadSeconds)),
    completionsByDay,
    perPerson,
    stateTotals,
  };
}

function toUnit(seconds: number | null, unit: TimeUnit) {
  if (seconds === null) return null;
  const value = unit === "hours" ? seconds / 3600 : seconds / 86400;
  return Math.round(value * 100) / 100;
}

const unitSuffix = (unit: TimeUnit) => (unit === "hours" ? "horas" : "días");

type RowContext = { task: ReportTask; person: ReportPerson | null };

function fieldValue(key: FieldKey, { task, person }: RowContext, config: ExportConfig): CellValue {
  switch (key) {
    case "title": return task.title;
    case "description": return task.description || null;
    case "status": return task.deleted ? "Eliminada" : task.status?.name ?? null;
    case "statusKind": return task.status ? KIND_LABEL[task.status.kind] : null;
    case "priority": return task.priority ? PRIORITY_LABEL[task.priority] : null;
    case "tags": return task.tags.join(", ") || null;
    case "id": return task.id;
    case "assignees": return config.rowMode === "person" ? person?.name ?? "Sin asignar" : task.assignees.map((item) => item.name).join(", ") || "Sin asignar";
    case "assigneeEmail": return config.rowMode === "person" ? person?.email ?? null : task.assignees.map((item) => item.email).filter(Boolean).join(", ") || null;
    case "createdBy": return task.createdBy?.name ?? null;
    case "createdAt": return toLocalWallClock(task.createdAt);
    case "startDate": return toLocalWallClock(task.startDate);
    case "dueDate": return toLocalWallClock(task.dueDate);
    case "startedAt": return toLocalWallClock(task.startedAt);
    case "completedAt": return toLocalWallClock(task.completedAt);
    case "deletedAt": return toLocalWallClock(task.deletedAt);
    case "cycleTime": return toUnit(cycleSeconds(task), config.timeUnit);
    case "leadTime": return toUnit(leadSeconds(task), config.timeUnit);
    case "commentsCount": return task.commentsCount;
    case "attachmentsCount": return task.attachmentsCount;
    case "deleted": return task.deleted ? "Sí" : "No";
  }
}

function fieldKind(key: FieldKey): Sheet["kinds"][number] {
  if (key === "startDate" || key === "dueDate") return "date";
  if (key === "createdAt" || key === "startedAt" || key === "completedAt" || key === "deletedAt") return "datetime";
  if (key === "cycleTime" || key === "leadTime") return "duration";
  if (key === "commentsCount" || key === "attachmentsCount") return "number";
  return "text";
}

export function buildTaskSheet(report: ProjectReport, tasks: ReportTask[], config: ExportConfig, filters: ReportFilters): Sheet {
  const states = statesOf(report);
  const periodsByTask = new Map<string, ReportPeriod[]>();
  report.periods.forEach((period) => {
    const list = periodsByTask.get(period.taskId);
    if (list) list.push(period);
    else periodsByTask.set(period.taskId, [period]);
  });
  const labels = new Map<string, string>(FIELD_DEFS.map((field) => [field.key, field.label]));

  const headers = config.fields.map((key) => {
    if (key === "cycleTime" || key === "leadTime") return `${labels.get(key)} (${unitSuffix(config.timeUnit)})`;
    if (key === "assignees" && config.rowMode === "task") return "Personas asignadas";
    return labels.get(key) ?? key;
  });
  const kinds = config.fields.map(fieldKind);
  if (config.stateTimes) {
    states.forEach((state) => {
      headers.push(`Tiempo en “${state.name}” (${unitSuffix(config.timeUnit)})`);
      kinds.push("duration");
    });
  }

  const rows: CellValue[][] = [];
  tasks.forEach((task) => {
    const stateSeconds = secondsByState(periodsByTask.get(task.id) ?? []);
    const people: Array<ReportPerson | null> = config.rowMode === "person" ? (task.assignees.length ? task.assignees : [null]) : [null];
    people
      .filter((person) => config.rowMode === "task" || !filters.personIds.length || filters.personIds.includes(person?.id ?? UNASSIGNED_ID))
      .forEach((person) => {
        const context = { task, person };
        const row = config.fields.map((key) => fieldValue(key, context, config));
        if (config.stateTimes) states.forEach((state) => row.push(stateSeconds.has(state.id) ? toUnit(stateSeconds.get(state.id)!, config.timeUnit) : null));
        rows.push(row);
      });
  });
  rows.sort((a, b) => String(a[0] ?? "").localeCompare(String(b[0] ?? "")));
  return { name: "Tareas", headers, rows, kinds };
}

export function buildSummarySheet(metrics: ReturnType<typeof computeMetrics>, config: ExportConfig): Sheet {
  const unit = unitSuffix(config.timeUnit);
  return {
    name: "Resumen por persona",
    headers: ["Persona", "Correo", "Tareas asignadas", "Terminadas en el periodo", "En curso ahora", `Tiempo promedio de trabajo (${unit})`, `Tiempo promedio total (${unit})`],
    kinds: ["text", "text", "number", "number", "number", "duration", "duration"],
    rows: metrics.perPerson.map((row) => [row.person.name, row.person.email ?? null, row.assigned, row.completed, row.inProgress, toUnit(row.avgCycle, config.timeUnit), toUnit(row.avgLead, config.timeUnit)]),
  };
}

export function buildDailySheet(report: ProjectReport, tasks: ReportTask[], filters: ReportFilters, config: ExportConfig): Sheet {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const buckets = new Map<string, { day: string; person: string; email: string | null; count: number; cycles: Array<number | null>; titles: string[] }>();
  tasks.forEach((task) => {
    if (!task.completedAt) return;
    const day = dayKey(task.completedAt);
    if (!inRange(day, filters)) return;
    const people = task.assignees.length ? task.assignees : [{ id: UNASSIGNED_ID, name: "Sin asignar" } as ReportPerson];
    people
      .filter((person) => !filters.personIds.length || filters.personIds.includes(person.id))
      .forEach((person) => {
        const key = `${day}|${person.id}`;
        const bucket = buckets.get(key) ?? { day, person: person.name, email: person.email ?? null, count: 0, cycles: [], titles: [] };
        bucket.count += 1;
        bucket.cycles.push(cycleSeconds(taskById.get(task.id)!));
        bucket.titles.push(task.title);
        buckets.set(key, bucket);
      });
  });
  const rows = [...buckets.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || a.person.localeCompare(b.person))
    .map((bucket) => [toLocalWallClock(bucket.day), bucket.person, bucket.email, bucket.count, toUnit(average(bucket.cycles), config.timeUnit), bucket.titles.join(" · ")] as CellValue[]);
  return {
    name: "Resumen diario",
    headers: ["Día", "Persona", "Correo", "Tareas terminadas", `Tiempo promedio de trabajo (${unitSuffix(config.timeUnit)})`, "Tareas"],
    kinds: ["date", "text", "text", "number", "duration", "text"],
    rows,
  };
}

export function buildPeriodsSheet(report: ProjectReport, tasks: ReportTask[], config: ExportConfig): Sheet {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const rows = report.periods
    .filter((period) => taskById.has(period.taskId))
    .map((period) => {
      const task = taskById.get(period.taskId)!;
      return [task.title, task.assignees.map((person) => person.name).join(", ") || "Sin asignar", period.columnName, period.columnKind ? KIND_LABEL[period.columnKind] : null, toLocalWallClock(period.enteredAt), toLocalWallClock(period.leftAt), toUnit(period.seconds, config.timeUnit), period.leftAt ? "No" : "Sí"] as CellValue[];
    });
  return {
    name: "Tiempo por estado",
    headers: ["Tarea", "Personas asignadas", "Estado", "Tipo", "Entró", "Salió", `Duración (${unitSuffix(config.timeUnit)})`, "¿Sigue ahí?"],
    kinds: ["text", "text", "text", "text", "datetime", "datetime", "duration", "text"],
    rows,
  };
}

export function buildHistorySheet(report: ProjectReport, tasks: ReportTask[], filters: ReportFilters, describe: (event: ProjectReport["events"][number]) => string, actionLabel: (action: ProjectReport["events"][number]["action"]) => string): Sheet {
  const taskIds = new Set(tasks.map((task) => task.id));
  const rows = report.events
    .filter((event) => taskIds.has(event.taskId) && inRange(dayKey(event.createdAt), filters))
    .map((event) => [toLocalWallClock(event.createdAt), event.taskTitle, event.actor?.name ?? "Sistema", actionLabel(event.action), `${event.actor?.name ?? "Sistema"} ${describe(event)}`, event.fromColumnName, event.toColumnName] as CellValue[]);
  return {
    name: "Historial",
    headers: ["Fecha y hora", "Tarea", "Usuario", "Acción", "Detalle", "Desde estado", "Hacia estado"],
    kinds: ["datetime", "text", "text", "text", "text", "text", "text"],
    rows,
  };
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return "< 1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24 ? `${hours % 24} h` : ""}`.trim();
}
