export const TASK_ATTACHMENTS_BUCKET = "task-attachments";

export function sanitizeFileName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9.\-_]+/g, "-").slice(-140) || "archivo";
}
