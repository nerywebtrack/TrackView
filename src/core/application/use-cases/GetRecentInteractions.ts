import type { Interaction } from "@/core/domain/entities/User";
import type { InteractionRepository } from "@/core/domain/repositories/InteractionRepository";

export class GetRecentInteractions {
  constructor(private readonly interactions: InteractionRepository) {}

  execute(limit = 5): Promise<Interaction[]> {
    return this.interactions.findRecent(limit);
  }
}
