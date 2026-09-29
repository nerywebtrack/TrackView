import type { Project } from "../entities/Project";

const DONE_COLUMN_NAME = "Done";

export function calculateProgress(project: Project): number {
  const total = project.columns.reduce(
    (count, column) => count + column.totalCount,
    0,
  );

  if (total === 0) {
    return 0;
  }

  const done = project.columns
    .filter((column) => column.name === DONE_COLUMN_NAME)
    .reduce((count, column) => count + column.totalCount, 0);

  return Math.round((done / total) * 100);
}
