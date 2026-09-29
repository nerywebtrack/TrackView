import type { Priority } from "@/core/domain/entities/Task";
import { FlagIcon } from "./Icons";

const styles: Record<Priority, { label: string; className: string }> = {
  low: {
    label: "LOW PRIORITY",
    className: "bg-emerald-50 text-emerald-600",
  },
  medium: {
    label: "MEDIUM PRIORITY",
    className: "bg-amber-50 text-amber-600",
  },
  high: {
    label: "HIGH PRIORITY",
    className: "bg-rose-50 text-rose-600",
  },
};

export default function PriorityBadge({ priority }: { priority: Priority }) {
  const style = styles[priority];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-t-2xl rounded-br-2xl px-3 py-1.5 text-[10px] font-semibold tracking-wide ${style.className}`}
    >
      <FlagIcon width={12} height={12} />
      {style.label}
    </span>
  );
}
