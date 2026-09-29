import type { User } from "../entities/User";

export interface UserRepository {
  findCurrent(): Promise<User>;
}
