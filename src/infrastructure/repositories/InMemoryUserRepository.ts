import type { User } from "@/core/domain/entities/User";
import type { UserRepository } from "@/core/domain/repositories/UserRepository";
import { users } from "@/infrastructure/data/users";

export class InMemoryUserRepository implements UserRepository {
  async findCurrent(): Promise<User> {
    return users.marcus;
  }
}
