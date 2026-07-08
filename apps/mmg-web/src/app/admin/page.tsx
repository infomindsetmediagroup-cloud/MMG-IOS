"use client";

import "./command-center.css";
import { useMemo, useState } from "react";

type ProcessingState =
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

type CommandParent = {
  id: string;
  title: string;
  summary: string;
  health: number;
  status: ProcessingState;
  activeItems: number;
  queueDepth: number;
  throughput: string;
  lastActivity: string;
  alerts: number;
  progress: number;
  modules: CommandModule[];
  events: CommandEvent[];
};

type CommandModule = {
  title: string;
  metric: string;
  detail: string;
  state: ProcessingState;
  progress: number;
};

type CommandEvent = {
  time: string;
  label: string;
  state: ProcessingState;
};

const stateLabels: Record<ProcessingState, string> = {
  queued: "Queued",
  initializing: "Initializing",
  running: "Running",
  processing: "Processing",
  waiting: "Waiting",
  reviewing: "Reviewing",
  finalizing: "Finalizing",
  completed: "Completed",
  failed: "Needs attention",
  paused: "Paused",
  cancelled: "Cancelled"
};

const commandParents: CommandParent[] = [
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
    ]
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
    ]
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
    ]
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
        metric: "Draft",
        detail: "Production status is blocked until final readiness checks pass.",
        state: "reviewing",
        progress: 52
      }
    ],
    events: [
      { time: "15 sec", label: "Runtime health heartbeat received", state: "running" },
      { time: "2 min", label: "Work loop state refreshed", state: "running" },
      { time: "9 min", label: "Release gate remains in review", state: "reviewing" }
    ]
  }
];

function StatusPill({ state }: { state: ProcessingState }) {
  return <span className={`command-status command-status--${state}`}>{stateLabels[state]}</span>;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="command-progress" aria-label={`Progress ${value}%`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function ParentCard({ parent, selected, onSelect }: { parent: CommandParent; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`command-parent-card ${selected ? "command-parent-card--selected" : ""}`} onClick={onSelect} type="button">
      <span className="command-card-topline">
        <StatusPill state={parent.status} />
        <span>{parent.lastActivity}</span>
      </span>
      <strong>{parent.title}</strong>
      <span className="mmg-muted">{parent.summary}</span>
      <dl className="command-metrics">
        <div>
          <dt>Health</dt>
          <dd>{parent.health}%</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{parent.activeItems}</dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd>{parent.queueDepth}</dd>
        </div>
        <div>
          <dt>Alerts</dt>
          <dd>{parent.alerts}</dd>
        </div>
      </dl>
      <ProgressBar value={parent.progress} />
    </button>
  );
}

function FocusView({ parent, onReturn }: { parent: CommandParent; onReturn: () => void }) {
  return (
    <section className="command-focus-panel" aria-labelledby={`${parent.id}-focus-title`}>
      <div className="command-focus-header">
        <div>
          <p className="mmg-kicker">Focused Collection</p>
          <h2 id={`${parent.id}-focus-title`}>{parent.title}</h2>
          <p className="mmg-muted">Only {parent.title.toLowerCase()} modules, state, and activity are shown in this view.</p>
        </div>
        <div className="command-health-ring" aria-label={`${parent.title} health ${parent.health}%`}>
          {parent.health}%
        </div>
      </div>

      <div className="command-focus-grid">
        {parent.modules.map((module) => (
          <article className="mmg-card command-module-card" key={module.title}>
            <span className="command-card-topline">
              <StatusPill state={module.state} />
              <span>{module.metric}</span>
            </span>
            <h3>{module.title}</h3>
            <p className="mmg-muted">{module.detail}</p>
            <ProgressBar value={module.progress} />
          </article>
        ))}
      </div>

      <section className="command-activity-stream" aria-label={`${parent.title} activity stream`}>
        <div className="command-section-heading">
          <p className="mmg-kicker">Activity Stream</p>
          <p className="mmg-muted">Development telemetry adapter. Replace with production telemetry before operational status.</p>
        </div>
        {parent.events.map((event) => (
          <article className="command-event" key={`${event.time}-${event.label}`}>
            <span>{event.time}</span>
            <strong>{event.label}</strong>
            <StatusPill state={event.state} />
          </article>
        ))}
      </section>

      <button className="command-return-button" type="button" onClick={onReturn}>
        Return to Main Control Panel
      </button>
    </section>
  );
}

export default function AdminPage() {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const selectedParent = useMemo(
    () => commandParents.find((parent) => parent.id === selectedParentId) ?? null,
    [selectedParentId]
  );

  return (
    <main>
      <section className="mmg-shell command-center-shell">
        <p className="mmg-kicker">Admin</p>
        <h1>MMG Command Center.</h1>
        <p className="mmg-muted command-center-intro">
          Live operations shell using state-backed development telemetry. Production telemetry must replace adapters before operational status.
        </p>

        <div className="command-parent-grid" aria-label="Command Center parent cards">
          {commandParents.map((parent) => (
            <ParentCard
              key={parent.id}
              parent={parent}
              selected={parent.id === selectedParentId}
              onSelect={() => setSelectedParentId(parent.id)}
            />
          ))}
        </div>

        {selectedParent ? (
          <FocusView parent={selectedParent} onReturn={() => setSelectedParentId(null)} />
        ) : (
          <section className="command-main-panel" aria-label="Main Control Panel">
            <div className="command-section-heading">
              <p className="mmg-kicker">Main Control Panel</p>
              <p className="mmg-muted">Select a parent card to open its focused collection.</p>
            </div>
            <div className="mmg-card-grid">
              {commandParents.map((parent) => (
                <article className="mmg-card command-module-card" key={`${parent.id}-summary`}>
                  <span className="command-card-topline">
                    <StatusPill state={parent.status} />
                    <span>{parent.throughput}</span>
                  </span>
                  <h2>{parent.title}</h2>
                  <p className="mmg-muted">{parent.summary}</p>
                  <ProgressBar value={parent.progress} />
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
