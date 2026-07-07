import { calculateReadinessScore } from "./readiness-score.js";
import { calculateCommerceReadiness } from "./commerce-readiness.js";
import { liveWorkMetrics } from "./live-work-queue.js";
import { actionOutputMetrics } from "./action-output.js";

export function calculateQAGate() {
  const system = calculateReadinessScore();
  const commerce = calculateCommerceReadiness();
  const work = liveWorkMetrics();
  const outputs = actionOutputMetrics();

  const workScore = work.total ? Math.round(((work.active + work.approval + work.complete) / work.total) * 100) : 0;
  const outputScore = outputs.total ? Math.round((outputs.generated / outputs.total) * 100) : 0;
  const score = Math.round((system.score + commerce.score + workScore + outputScore) / 4);

  return {
    score,
    system: system.score,
    commerce: commerce.score,
    work: workScore,
    outputs: outputScore,
    status: score >= 85 ? "Pass" : score >= 60 ? "Watch" : "Block",
    createdAt: new Date().toLocaleString()
  };
}
