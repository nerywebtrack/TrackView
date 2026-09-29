import type { User } from "@/core/domain/entities/User";
import { cn } from "@/lib/utils";

type AvatarProps = {
  user: User;
  size?: number;
  className?: string;
};

export default function Avatar({ user, size = 24, className }: AvatarProps) {
  return (
    <span
      title={user.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: user.color,
        fontSize: Math.round(size * 0.4),
        ...(user.avatarUrl
          ? { backgroundImage: `url(${user.avatarUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
          : {}),
      }}
    >
      {!user.avatarUrl && user.initials}
    </span>
  );
}
