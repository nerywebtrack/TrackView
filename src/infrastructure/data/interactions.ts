import type { Interaction } from "@/core/domain/entities/User";
import { users } from "./users";

export const interactions: Interaction[] = [
  { user: users.robin, timeAgo: "2 min. ago" },
  { user: users.olive, timeAgo: "40 min. ago" },
  { user: users.sophia, timeAgo: "4 hours ago" },
  { user: users.marcus, timeAgo: "2 days ago" },
  { user: users.maya, timeAgo: "5 days ago" },
];
