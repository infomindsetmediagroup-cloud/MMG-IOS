import { getMissionControl } from './mission-control-engine.js';
import { getOperationsSnapshot } from './operations-snapshot-engine.js';

const customerValueBrief = {
  promise: 'Your Knowledge Has Value.',
  support: 'Helping you discover it, build it, and share it with the world.',
  positioning: 'Build around the value only you can provide.',
  nextAction: 'Identify the customer knowledge already present, package it into a useful asset, and define the next execution step.'
};

export function getCommandCenterBrief() {
  const mission = getMissionControl();
  const snapshot = getOperationsSnapshot();

  return {
    title: 'Command Center Brief',
    status: mission.status,
    summary: snapshot.summary,
    primary: mission.headline,
    tasks: mission.tasks,
    customerValue: customerValueBrief,
    updated: new Date().toLocaleString()
  };
}
