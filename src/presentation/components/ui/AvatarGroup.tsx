import type { User } from "@/core/domain/entities/User";
import Avatar from "./Avatar";

type AvatarGroupProps = {
  users: User[];
  extra?: number;
  size?: number;
};

export default function AvatarGroup({
  users,
  extra = 0,
  size = 28,
}: AvatarGroupProps) {
  return (
    <div className="flex items-center">
      {users.map((user) => (
        <Avatar key={user.id} user={user} size={size} className="-ml-2 first:ml-0" />
      ))}
      {extra > 0 && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600 ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
