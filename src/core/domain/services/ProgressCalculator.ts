import { columnKindOf } from "../entities/BoardColumn";
import type { Project } from "../entities/Project";

export function calculateProgress(project: Project): number {
  const total = project.columns.reduce(
    (count, column) => count + column.totalCount,
    0,
  );

  if (total === 0) {
    return 0;
  }

  const done = project.columns
    .filter((column) => columnKindOf(column) === "done")
    .reduce((count, column) => count + column.totalCount, 0);

  return Math.round((done / total) * 100);
}
