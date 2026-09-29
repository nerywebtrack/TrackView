import type { TaskActivity } from "@/core/domain/entities/TaskActivity";

export type ActivityLike = Pick<TaskActivity, "action" | "field" | "oldValue" | "newValue" | "fromColumnName" | "toColumnName">;

export const ACTION_LABEL: Record<TaskActivity["action"], string> = {
  created: "Creada",
  status_changed: "Cambio de estado",
  updated: "Edición",
  deleted: "Eliminada",
  assignee_added: "Persona asignada",
  assignee_removed: "Persona removida",
  comment_added: "Comentario",
  attachment_added: "Adjunto agregado",
  attachment_removed: "Adjunto eliminado",
};

const FIELD_LABEL: Record<string, string> = {
  title: "el nombre",
  description: "la descripción",
  priority: "la prioridad",
  start_date: "la fecha de inicio",
  due_date: "la fecha final",
  tags: "las etiquetas",
};

export function describeActivity(event: ActivityLike) {
  const value = (event.newValue ?? {}) as Record<string, unknown>;
  switch (event.action) {
    case "created":
      return value.backfilled ? `registró el ticket en ${event.toColumnName ?? "el tablero"} (historial desde esta fecha)` : `creó el ticket en ${event.toColumnName ?? "el tablero"}`;
    case "status_changed":
      return `movió el ticket de ${event.fromColumnName ?? "?"} a ${event.toColumnName ?? "?"}`;
    case "deleted":
      return "eliminó el ticket";
    case "assignee_added":
      return `asignó a ${String(value.name ?? "alguien")}`;
    case "assignee_removed":
      return `quitó a ${String(value.name ?? "alguien")}`;
    case "comment_added":
      return `comentó: “${String(value.body ?? "")}”`;
    case "attachment_added":
      return `${value.kind === "link" ? "agregó el enlace" : "adjuntó"} ${String(value.name ?? "")}`;
    case "attachment_removed":
      return `eliminó el adjunto ${String(value.name ?? "")}`;
    case "updated": {
      if (event.field === "highlighted") return event.newValue ? "destacó el ticket" : "quitó el destacado";
      if (event.field === "description") return "editó la descripción";
      const label = FIELD_LABEL[event.field ?? ""] ?? event.field ?? "un campo";
      return `cambió ${label} de ${formatValue(event.oldValue)} a ${formatValue(event.newValue)}`;
    }
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "vacío";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "ninguna";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${month}/${day}/${year}`;
  }
  return `“${String(value)}”`;
}
