import type { User } from "@/core/domain/entities/User";
import type { UserRepository } from "@/core/domain/repositories/UserRepository";

export class GetCurrentUser {
  constructor(private readonly users: UserRepository) {}

  execute(): Promise<User> {
    return this.users.findCurrent();
  }
}
