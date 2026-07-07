const notificationKey = "kairos.notifications.v1";

const seedNotifications = [
  {
    id: "notice-dashboard-online",
    title: "Kairos dashboard online",
    body: "Phase 1 command center is live on GitHub Pages.",
    level: "Success",
    createdAt: "Runtime"
  },
  {
    id: "notice-actions-local",
    title: "Command actions enabled",
    body: "Dashboard buttons now queue local runtime actions and snapshots.",
    level: "Info",
    createdAt: "Runtime"
  },
  {
    id: "notice-ci-protection",
    title: "Workflow conservation active",
    body: "Active build commits use skip ci when possible to protect GitHub Actions minutes.",
    level: "Warning",
    createdAt: "Runtime"
  }
];

function readNotifications() {
  try {
    return JSON.parse(localStorage.getItem(notificationKey) || "null") || seedNotifications;
  } catch {
    return seedNotifications;
  }
}

export function getNotifications() {
  return readNotifications();
}

export function pushNotification(title, body, level = "Info") {
  const notice = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    body,
    level,
    createdAt: new Date().toLocaleString()
  };
  const next = [notice, ...readNotifications()].slice(0, 16);
  localStorage.setItem(notificationKey, JSON.stringify(next));
  return notice;
}

export function clearNotifications() {
  localStorage.setItem(notificationKey, JSON.stringify([]));
}
