import type { MMGCommerceOperationsAdapter } from "../deployment/live-commerce-deployment-gateway.js";
import type { MMGCommerceDeploymentEnvironment } from "../deployment/live-commerce-deployment.js";
import type { MMGCommerceRehearsalEvidenceAdapter } from "./postgres-commerce-rehearsal-evidence.js";

export interface MMGCommerceSubsystemActivationGateway {
  inspect(input: { environment: MMGCommerceDeploymentEnvironment }): Promise<{
    schedulerActive: boolean;
    dispatcherActive: boolean;
    storageSignerActive: boolean;
  }>;
  activate(input: { environment: MMGCommerceDeploymentEnvironment }): Promise<{
    schedulerActive: boolean;
    dispatcherActive: boolean;
    storageSignerActive: boolean;
  }>;
  deactivate(input: { environment: MMGCommerceDeploymentEnvironment }): Promise<void>;
}

export class MMGReleaseBoundCommerceOperationsAdapter
  implements MMGCommerceOperationsAdapter
{
  readonly #environment: MMGCommerceDeploymentEnvironment;
  readonly #releaseId: string;
  readonly #subsystems: MMGCommerceSubsystemActivationGateway;
  readonly #rehearsal: MMGCommerceRehearsalEvidenceAdapter;
  readonly #now: () => Date;

  constructor(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseId: string;
    subsystems: MMGCommerceSubsystemActivationGateway;
    rehearsal: MMGCommerceRehearsalEvidenceAdapter;
    now?: () => Date;
  }) {
    this.#environment = input.environment;
    this.#releaseId = input.releaseId;
    this.#subsystems = input.subsystems;
    this.#rehearsal = input.rehearsal;
    this.#now = input.now ?? (() => new Date());
  }

  async inspect() {
    const [subsystems, stagingRehearsalPassed] = await Promise.all([
      this.#subsystems.inspect({ environment: this.#environment }),
      this.#rehearsal.hasFreshPassedEvidence({
        releaseId: this.#releaseId,
        maximumAgeSeconds: 24 * 60 * 60,
        asOf: this.#now(),
      }),
    ]);
    return { ...subsystems, stagingRehearsalPassed };
  }

  async activate() {
    const subsystems = await this.#subsystems.activate({
      environment: this.#environment,
    });
    const stagingRehearsalPassed = await this.#rehearsal.hasFreshPassedEvidence({
      releaseId: this.#releaseId,
      maximumAgeSeconds: 24 * 60 * 60,
      asOf: this.#now(),
    });
    return { ...subsystems, stagingRehearsalPassed };
  }

  deactivate(): Promise<void> {
    return this.#subsystems.deactivate({ environment: this.#environment });
  }
}
