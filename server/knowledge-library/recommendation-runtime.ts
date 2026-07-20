import { MMGPostgresRecommendationCandidateRepository } from "./recommendation-candidate-repository.js";
import { MMGKairosRecommendationCurator } from "./recommendation-curator.js";
import { MMGPostgresRecommendationRepository } from "./recommendation-repository.js";
import type { MMGTransactionalDatabase } from "./persistence.js";

export const createMMGKairosRecommendationCurator = (input: {
  database: MMGTransactionalDatabase;
  now?: () => Date;
}): MMGKairosRecommendationCurator =>
  new MMGKairosRecommendationCurator({
    repository: new MMGPostgresRecommendationRepository(input.database),
    candidateRepository: new MMGPostgresRecommendationCandidateRepository(
      input.database,
    ),
    now: input.now ?? (() => new Date()),
  });