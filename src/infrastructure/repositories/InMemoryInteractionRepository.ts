import type { Interaction } from "@/core/domain/entities/User";
import type { InteractionRepository } from "@/core/domain/repositories/InteractionRepository";
import { interactions } from "@/infrastructure/data/interactions";

export class InMemoryInteractionRepository implements InteractionRepository {
  async findRecent(limit = 5): Promise<Interaction[]> {
    return interactions.slice(0, limit);
  }
}
