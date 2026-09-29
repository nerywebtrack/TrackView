import type { User } from "@/core/domain/entities/User";

export const users: Record<string, User> = {
  robin: {
    id: "u-robin",
    name: "Robin Cooper",
    initials: "RC",
    color: "#f59e0b",
  },
  olive: {
    id: "u-olive",
    name: "Olive Kenji",
    initials: "OK",
    color: "#8b5cf6",
  },
  sophia: {
    id: "u-sophia",
    name: "Sophia Bennett",
    initials: "SB",
    color: "#ec4899",
  },
  marcus: {
    id: "u-marcus",
    name: "Marcus Levin",
    initials: "ML",
    color: "#0ea5e9",
  },
  maya: {
    id: "u-maya",
    name: "Maya Hart",
    initials: "MH",
    color: "#10b981",
  },
  alex: {
    id: "u-alex",
    name: "Alex Hill",
    initials: "AH",
    color: "#6366f1",
  },
};
