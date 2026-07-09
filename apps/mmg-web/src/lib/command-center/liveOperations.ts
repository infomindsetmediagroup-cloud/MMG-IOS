export type CommandProcessingState =
  | "queued"
  | "initializing"
  | "running"
  | "processing"
  | "waiting"
  | "reviewing"
  | "finalizing"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export type CommandEvent = {
  time: string;
  label: string;
  state: CommandProcessingState;
};

export type CommandModule = {
  title: string;
  metric: string;
  detail: string;
  state: CommandProcessingState;
  progress: number;
};

export type CommandReleaseGateSignal = {
  id: string;
  title: string;
  status: "ready" | "blocked" | "reviewing";
  blockedChecks: number;
  requiredAction: string;
};

export type CommandParent = {
  id: string;
  title: string;
  summary: string;
  health: number;
  status: CommandProcessingState;
  activeItems: number;
  queueDepth: number;
  throughput: string;
  lastActivity: string;
  alerts: number;
  progress: number;
  modules: CommandModule[];
  events: CommandEvent[];
  releaseGateSignals?: CommandReleaseGateSignal[];
};

export type CommandCenterTelemetry = {
  source: "development-adapter" | "production-telemetry";
  generatedAt: string;
  parents: CommandParent[];
};

export const commandStateLabels: Record<CommandProcessingState, string> = {
  queued: "Queued",
  initializing: "Initializing",
  running: "Running",
  processing: "Processing",
  waiting: "Waiting",
  reviewing: "Reviewing",
  completed: "Completed",
  finalizing: "Finalizing",
  failed: "Needs attention",
  paused: "Paused",
  cancelled: "Cancelled"
};

const releaseGateSignals: CommandReleaseGateSignal[] = [
  {
    id: "creator-bible-cover-release",
    title: "Creator's Bible cover package",
    status: "blocked",
    blockedChecks: 2,
    requiredAction: "Approve final deliverable metadata before customer download access."
  },
  {
    id: "ai-prompting-preview-release",
    title: "AI Prompting preview asset",
    status: "reviewing",
    blockedChecks: 1,
    requiredAction: "Confirm production asset is approvedDeliverable, not workspaceDraft."
  }
];

export function getDevelopmentCommandCenterTelemetry(): CommandCenterTelemetry {
  return {
    source: "development-adapter",
    generatedAt: new Date().toISOString(),
    parents: [
      {
        id: "executive",
        title: "Executive",
        summary: "Approvals, decisions, and operating priorities.",
        health: 98,
        status: "running",
        activeItems: 4,
        queueDepth: 2,
        throughput: "12 decisions/day",
        lastActivity: "2 min ago",
        alerts: 0,
        progress: 72,
        modules: [
          {
            title: "Approval Gate",
            metric: "2 pending",
            detail: "Work orders awaiting executive acceptance.",
            state: "reviewing",
            progress: 58
          },
          {
            title: "Priority Stack",
            metric: "P0 active",
            detail: "Command Center Live Operations is next immediate work.",
            state: "running",
            progress: 72
          },
          {
            title: "Decision Log",
            metric: "18 entries",
            detail: "Recent accepted architecture and roadmap decisions.",
            state: "completed",
            progress: 100
          }
        ],
        events: [
          { time: "Now", label: "Command Center Live Operations elevated to P0", state: "running" },
          { time: "3 min", label: "Blueprint refreeze note recorded", state: "completed" },
          { time: "8 min", label: "Approval queue refreshed", state: "reviewing" }
        ],
        releaseGateSignals
      },
      {
        id: "knowledge",
        title: "Knowledge",
        summary: "Documents, vaults, indexing, and approved learning.",
        health: 94,
        status: "processing",
        activeItems: 7,
        queueDepth: 5,
        throughput: "42 records/hr",
        lastActivity: "45 sec ago",
        alerts: 1,
        progress: 64,
        modules: [
          {
            title: "Knowledge Index",
            metric: "64%",
            detail: "Development adapter tracking indexing readiness.",
            state: "processing",
            progress: 64
          },
          {
            title: "Candidate Review",
            metric: "5 queued",
            detail: "Knowledge Event candidates waiting for trust review.",
            state: "queued",
            progress: 22
          },
          {
            title: "Vault Boundary",
            metric: "Isolated",
            detail: "Customer and admin knowledge scopes remain separated.",
            state: "completed",
            progress: 100
          }
        ],
        events: [
          { time: "45 sec", label: "Knowledge processing heartbeat received", state: "processing" },
          { time: "4 min", label: "Candidate review queue updated", state: "queued" },
          { time: "11 min", label: "Vault boundary check completed", state: "completed" }
        ]
      },
      {
        id: "publishing",
        title: "Publishing",
        summary: "Books, exports, product content, and production flow.",
        health: 96,
        status: "running",
        activeItems: 5,
        queueDepth: 3,
        throughput: "9 assets/hr",
        lastActivity: "1 min ago",
        alerts: 0,
        progress: 81,
        modules: [
          {
            title: "Production Queue",
            metric: "3 queued",
            detail: "Publishing items staged for next processing pass.",
            state: "queued",
            progress: 34
          },
          {
            title: "Asset Pipeline",
            metric: "81%",
            detail: "Current production sequence is advancing.",
            state: "running",
            progress: 81
          },
          {
            title: "Quality Review",
            metric: "Ready",
            detail: "Review checkpoint prepared for generated deliverables.",
            state: "reviewing",
            progress: 66
          }
        ],
        events: [
          { time: "1 min", label: "Publishing pipeline heartbeat received", state: "running" },
          { time: "6 min", label: "Asset queue recalculated", state: "queued" },
          { time: "10 min", label: "Review checkpoint prepared", state: "reviewing" }
        ],
        releaseGateSignals
      },
      {
        id: "customers",
        title: "Customers",
        summary: "Profiles, subscriptions, journeys, and service state.",
        health: 92,
        status: "waiting",
        activeItems: 3,
        queueDepth: 1,
        throughput: "6 journeys/day",
        lastActivity: "5 min ago",
        alerts: 1,
        progress: 49,
        modules: [
          {
            title: "Journey Progress",
            metric: "49%",
            detail: "Customer journey telemetry contract pending production source.",
            state: "waiting",
            progress: 49
          },
          {
            title: "Subscription Activity",
            metric: "Adapter",
            detail: "Development state ready for future billing integration.",
            state: "initializing",
            progress: 18
          },
          {
            title: "Context Isolation",
            metric: "Active",
            detail: "Customer context boundaries remain enforced.",
            state: "completed",
            progress: 100
          }
        ],
        events: [
          { time: "5 min", label: "Customer activity adapter refreshed", state: "waiting" },
          { time: "7 min", label: "Subscription contract initialized", state: "initializing" },
          { time: "13 min", label: "Context isolation check completed", state: "completed" }
        ],
        releaseGateSignals
      },
      {
        id: "operations",
        title: "Operations",
        summary: "Runtime health, deployment readiness, and work loops.",
        health: 97,
        status: "running",
        activeItems: 8,
        queueDepth: 4,
        throughput: "24 events/hr",
        lastActivity: "15 sec ago",
        alerts: 0,
        progress: 76,
        modules: [
          {
            title: "Runtime Health",
            metric: "97%",
            detail: "Health contract is active for the development surface.",
            state: "running",
            progress: 97
          },
          {
            title: "Work Loop",
            metric: "76%",
            detail: "Plan, approval, department work, QA, and acceptance flow.",
            state: "running",
            progress: 76
          },
          {
            title: "Release Gate",
            metric: "2 blocked",
            detail: "Customer deliverables remain blocked until production-only release checks pass.",
            state: "reviewing",
            progress: 52
          }
        ],
        events: [
          { time: "15 sec", label: "Runtime health heartbeat received", state: "running" },
          { time: "2 min", label: "Customer release gate signals refreshed", state: "reviewing" },
          { time: "9 min", label: "Release gate remains in review", state: "reviewing" }
        ],
        releaseGateSignals
      }
    ]
  };
}
