import type { Interaction } from "../entities/User";

export interface InteractionRepository {
  findRecent(limit?: number): Promise<Interaction[]>;
}
