const notificationKey = "kairos.notifications.v1";
const maxNotifications = 16;
const validLevels = ["Info", "Success", "Warning", "Danger"];

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

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function normalizeLevel(level) {
  const value = String(level || "Info");
  return validLevels.includes(value) ? value : "Info";
}

function normalizeNotification(notice, index = 0) {
  return {
    id: String(notice?.id || `notice-${index}-${makeId()}`),
    title: String(notice?.title || "Untitled Notification"),
    body: String(notice?.body || "No notification detail available."),
    level: normalizeLevel(notice?.level),
    createdAt: String(notice?.createdAt || new Date().toLocaleString())
  };
}

function normalizeNotifications(items) {
  const source = Array.isArray(items) ? items : seedNotifications;
  return source.map(normalizeNotification).slice(0, maxNotifications);
}

function readNotifications() {
  try {
    return normalizeNotifications(JSON.parse(localStorage.getItem(notificationKey) || "null"));
  } catch {
    return normalizeNotifications(seedNotifications);
  }
}

function saveNotifications(items) {
  const normalized = normalizeNotifications(items);
  localStorage.setItem(notificationKey, JSON.stringify(normalized));
  return normalized;
}

export function getNotifications() {
  return readNotifications();
}

export function pushNotification(title, body, level = "Info") {
  const notice = normalizeNotification({
    id: makeId(),
    title,
    body,
    level,
    createdAt: new Date().toLocaleString()
  });
  saveNotifications([notice, ...readNotifications()]);
  return notice;
}

export function clearNotifications() {
  localStorage.setItem(notificationKey, JSON.stringify([]));
}
