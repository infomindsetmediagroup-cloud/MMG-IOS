"use client";

import { useMemo, useState } from "react";
import {
  type CommandCenterTelemetry,
  type CommandParent,
  type CommandProcessingState,
  commandStateLabels
} from "@/lib/command-center/liveOperations";

function StatusPill({ state }: { state: CommandProcessingState }) {
  return <span className={`command-status command-status--${state}`}>{commandStateLabels[state]}</span>;
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
        <div><dt>Health</dt><dd>{parent.health}%</dd></div>
        <div><dt>Active</dt><dd>{parent.activeItems}</dd></div>
        <div><dt>Queue</dt><dd>{parent.queueDepth}</dd></div>
        <div><dt>Alerts</dt><dd>{parent.alerts}</dd></div>
      </dl>
      <ProgressBar value={parent.progress} />
    </button>
  );
}

function FocusView({ parent, telemetrySource, onReturn }: { parent: CommandParent; telemetrySource: string; onReturn: () => void }) {
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
          <p className="mmg-muted">{telemetrySource}. Replace with production telemetry before operational status.</p>
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

export function CommandCenter({ telemetry }: { telemetry: CommandCenterTelemetry }) {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const selectedParent = useMemo(
    () => telemetry.parents.find((parent) => parent.id === selectedParentId) ?? null,
    [selectedParentId, telemetry.parents]
  );

  return (
    <>
      <div className="command-parent-grid" aria-label="Command Center parent cards">
        {telemetry.parents.map((parent) => (
          <ParentCard
            key={parent.id}
            parent={parent}
            selected={parent.id === selectedParentId}
            onSelect={() => setSelectedParentId(parent.id)}
          />
        ))}
      </div>

      {selectedParent ? (
        <FocusView parent={selectedParent} telemetrySource={telemetry.source} onReturn={() => setSelectedParentId(null)} />
      ) : (
        <section className="command-main-panel" aria-label="Main Control Panel">
          <div className="command-section-heading">
            <p className="mmg-kicker">Main Control Panel</p>
            <p className="mmg-muted">Select a parent card to open its focused collection.</p>
          </div>
          <div className="mmg-card-grid">
            {telemetry.parents.map((parent) => (
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
    </>
  );
}
