export type UserId = string;

export interface User {
  id: UserId;
  name: string;
  initials: string;
  color: string;
  email?: string;
  avatarUrl?: string;
  role?: "owner" | "member";
}

export interface Interaction {
  user: User;
  timeAgo: string;
}
