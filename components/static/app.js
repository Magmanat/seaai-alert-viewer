const state = {
  snapshot: null,
  lastAlertsSignature: "",
  modalAlertId: null,
  modalView: null,
  hasInitializedAlerts: false,
  knownAlertIds: new Set(),
  alertAudioContext: null,
  alertAudioBuffer: null,
  alertAudioLoadingPromise: null,
  alertAudioReady: false,
  upstreamUrl: "",
  demoAlertIndex: 0,
  session: {
    mode: "lite",
    user: null,
    canDemo: true,
    canClear: true,
    canConfigureWebsocket: true,
    canManageUsers: false,
  },
  isLoadingMoreAlerts: false,
  uiSocket: null,
  uiSocketReconnectTimer: null,
  uiSocketWatchdogTimer: null,
  uiSocketRetryMs: 1000,
  uiSocketLastMessageAt: 0,
  mapWindowSeconds: 60,
  timelineMode: "live",
  timelineDate: "",
  timelineSecond: 0,
  timelineTracks: null,
  timelineLoading: false,
  timelineRequestId: 0,
  timelineDragging: false,
  filters: {
    bearing: new Set(),
    type: new Set(),
  },
  modalImageView: {
    baseScale: 1,
    fitScale: 1,
    baseTranslateX: 0,
    baseTranslateY: 0,
    scale: 1,
    minScale: 1,
    maxScale: 6,
    translateX: 0,
    translateY: 0,
    pointerId: null,
    panStartX: 0,
    panStartY: 0,
    originTranslateX: 0,
    originTranslateY: 0,
    dragMoved: false,
    sourceKey: null,
  },
  mapView: {
    scale: 1,
    minScale: 1,
    maxScale: 5,
    translateX: 0,
    translateY: 0,
    pointerId: null,
    pointerAlertId: null,
    panStartX: 0,
    panStartY: 0,
    originTranslateX: 0,
    originTranslateY: 0,
    dragMoved: false,
  },
  modalMapView: {
    scale: 1,
    minScale: 1,
    maxScale: 5,
    translateX: 0,
    translateY: 0,
    pointerId: null,
    panStartX: 0,
    panStartY: 0,
    originTranslateX: 0,
    originTranslateY: 0,
    dragMoved: false,
  },
};

const mapRoot = document.getElementById("map-root");
const mapStage = document.getElementById("map-stage");
const mapSvg = document.getElementById("map-svg");
const mapOverlay = document.getElementById("map-overlay");
const mapEmpty = document.getElementById("map-empty");
const mapWindowButtons = document.getElementById("map-window-buttons");
const timelineDateSelect = document.getElementById("timeline-date");
const timelineLiveButton = document.getElementById("timeline-live");
const timelineSlider = document.getElementById("timeline-slider");
const timelineCurrentLabel = document.getElementById("timeline-current-label");
const alertsList = document.getElementById("alerts-list");
const alertsEmpty = document.getElementById("alerts-empty");
const alertCount = document.getElementById("alert-count");
const pushDemoAlertButton = document.getElementById("push-demo-alert");
const clearAlertsButton = document.getElementById("clear-alerts");
const upstreamUrlInput = document.getElementById("upstream-url");
const applyUpstreamUrlButton = document.getElementById("apply-upstream-url");
const filterPanel = document.getElementById("filter-panel");
const trackCount = document.getElementById("track-count");
const statusPill = document.getElementById("status-pill");
const statusLabel = document.getElementById("status-label");
const lastMessage = document.getElementById("last-message");
const adminPanel = document.getElementById("admin-panel");
const createUserForm = document.getElementById("create-user-form");
const newUsernameInput = document.getElementById("new-username");
const newPasswordInput = document.getElementById("new-password");
const usersList = document.getElementById("users-list");
const logoutButton = document.getElementById("logout-button");

const modalOverlay = document.getElementById("alert-modal");
const modalClose = document.getElementById("modal-close");
const modalViewToggle = document.getElementById("modal-view-toggle");
const modalImageContainer = document.getElementById("modal-image-container");
const modalAlertMap = document.getElementById("modal-alert-map");
const modalZoomWrapper = document.getElementById("modal-zoom-wrapper");
const modalImage = document.getElementById("modal-image");
const modalBoundingBox = document.getElementById("modal-bounding-box");
const modalEmpty = document.getElementById("modal-empty");

const SVG_NS = "http://www.w3.org/2000/svg";
const ALERT_SOUND_URL = "/static/assets/alert_sound.mp3";
const DEMO_ALERTS = [
  {
    track_id: "vessel-approaching",
    classification: "VESSEL",
    bearing_identification: "APPROACHING",
    confidence_level: 0.92,
    position_history: [[800, 2], [700, 1], [600, 0], [500, -1]],
    position: [400, 0],
    bounding_boxes: { T2: [0.3, 0.25, 0.7, 0.75] },
  },
  {
    track_id: "vessel-lateral-left",
    classification: "VESSEL",
    bearing_identification: "LATERAL_CROSSING",
    confidence_level: 0.88,
    position_history: [[650, 32], [620, 20], [600, 8], [590, -4]],
    position: [580, -16],
    bounding_boxes: { T2: [0.12, 0.28, 0.42, 0.72] },
  },
  {
    track_id: "vessel-lateral-right",
    classification: "VESSEL",
    bearing_identification: "LATERAL_CROSSING",
    confidence_level: 0.86,
    position_history: [[650, -32], [620, -20], [600, -8], [590, 4]],
    position: [580, 16],
    bounding_boxes: { T2: [0.58, 0.28, 0.88, 0.72] },
  },
  {
    track_id: "swimmer-approaching",
    classification: "SWIMMER",
    bearing_identification: "APPROACHING",
    confidence_level: 0.81,
    position_history: [[380, -10], [330, -8], [280, -6], [230, -4]],
    position: [180, -3],
    bounding_boxes: { T2: [0.4, 0.18, 0.58, 0.62] },
  },
  {
    track_id: "swimmer-lateral-left",
    classification: "SWIMMER",
    bearing_identification: "LATERAL_CROSSING",
    confidence_level: 0.79,
    position_history: [[360, 28], [350, 16], [340, 5], [330, -6]],
    position: [320, -18],
    bounding_boxes: { T2: [0.18, 0.22, 0.36, 0.64] },
  },
  {
    track_id: "swimmer-lateral-right",
    classification: "SWIMMER",
    bearing_identification: "LATERAL_CROSSING",
    confidence_level: 0.77,
    position_history: [[360, -28], [350, -16], [340, -5], [330, 6]],
    position: [320, 18],
    bounding_boxes: { T2: [0.64, 0.22, 0.82, 0.64] },
  },
];

function normalizeUpstreamUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("://")) {
    return `ws${trimmed}`;
  }
  if (trimmed.startsWith("//")) {
    return `ws:${trimmed}`;
  }
  if (!trimmed.includes("://")) {
    return `ws://${trimmed}`;
  }
  return trimmed;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!state.alertAudioContext) {
    state.alertAudioContext = new AudioContextClass();
  }

  return state.alertAudioContext;
}

async function unlockAlertAudio() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    state.alertAudioReady = context.state === "running";
    if (state.alertAudioReady) {
      void loadAlertAudioBuffer();
    }
  } catch {
    state.alertAudioReady = false;
  }
}

async function loadAlertAudioBuffer() {
  const context = getAudioContext();
  if (!context) {
    return null;
  }

  if (state.alertAudioBuffer) {
    return state.alertAudioBuffer;
  }
  if (state.alertAudioLoadingPromise) {
    return state.alertAudioLoadingPromise;
  }

  state.alertAudioLoadingPromise = fetch(ALERT_SOUND_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load alert sound (${response.status})`);
      }
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
    .then((audioBuffer) => {
      state.alertAudioBuffer = audioBuffer;
      return audioBuffer;
    })
    .catch(() => null)
    .finally(() => {
      state.alertAudioLoadingPromise = null;
    });

  return state.alertAudioLoadingPromise;
}

async function playAlertDing() {
  const context = getAudioContext();
  if (!context || !state.alertAudioReady) {
    return;
  }
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }
  if (context.state !== "running") {
    return;
  }

  const audioBuffer = await loadAlertAudioBuffer();
  if (!audioBuffer) {
    return;
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = 0.75;
  source.buffer = audioBuffer;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
}

function syncAlertNotifications(alerts) {
  const nextAlertIds = new Set(alerts.map((alert) => alert.id));
  const hasNewAlerts =
    state.hasInitializedAlerts &&
    alerts.some(
      (alert) =>
        !state.knownAlertIds.has(alert.id) && matchesActiveFilters(alert),
    );

  state.knownAlertIds = nextAlertIds;
  state.hasInitializedAlerts = true;

  if (hasNewAlerts) {
    void playAlertDing();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTimestamp(timestampMs) {
  if (!timestampMs) return "Unknown time";
  const date = new Date(timestampMs);
  return date
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSecondOfDay(second) {
  const clamped = Math.max(0, Math.min(second, 86399));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function getLocalSecondOfDay(date = new Date()) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function getMaxTimelineSecond(dateKey) {
  return dateKey === formatDateKey(new Date()) ? getLocalSecondOfDay() : 86399;
}

function formatLastMessage(snapshot) {
  const lastMessageAtMs = snapshot?.status?.lastMessageAtMs;
  if (!lastMessageAtMs) {
    return snapshot?.status?.lastError || "No messages received yet";
  }
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - lastMessageAtMs) / 1000),
  );
  const suffix = ageSeconds === 0 ? "just now" : `${ageSeconds}s ago`;
  return `Last message ${suffix} (${formatTimestamp(lastMessageAtMs)})`;
}

function updateStatus(snapshot) {
  const connected = Boolean(snapshot?.status?.connected);
  statusPill.classList.toggle("connected", connected);
  statusPill.classList.toggle("disconnected", !connected);
  statusLabel.textContent = connected ? "Connected" : "Disconnected";
  lastMessage.textContent = formatLastMessage(snapshot);
  clearAlertsButton.disabled = !snapshot?.alerts?.length;
}

function applyViewerPermissions(snapshot = null) {
  const viewer = snapshot?.viewer || {};
  state.session = {
    ...state.session,
    ...viewer,
  };
  const canDemo = state.session.canDemo !== false;
  const canClear = state.session.canClear !== false;
  const canConfigureWebsocket = state.session.canConfigureWebsocket !== false;
  const canManageUsers = Boolean(state.session.canManageUsers);

  pushDemoAlertButton.hidden = !canDemo;
  clearAlertsButton.hidden = !canClear;
  upstreamUrlInput.disabled = !canConfigureWebsocket;
  applyUpstreamUrlButton.hidden = !canConfigureWebsocket;
  if (!canConfigureWebsocket) {
    upstreamUrlInput.title = "Only admin users can change the upstream websocket URL";
    upstreamUrlInput.placeholder = "Configured by admin";
    state.upstreamUrl = "";
    updateUpstreamUrlInput();
  } else {
    upstreamUrlInput.title = "";
    upstreamUrlInput.placeholder = "ws://host:port/path";
  }
  if (adminPanel) {
    adminPanel.hidden = !canManageUsers;
  }
  if (logoutButton) {
    logoutButton.hidden = state.session.mode !== "full";
  }
  if (canManageUsers) {
    void loadUsers();
  }
}

async function loadSession() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) {
      return;
    }
    const session = await response.json();
    state.session = {
      ...state.session,
      ...session,
    };
    applyViewerPermissions();
  } catch {
    applyViewerPermissions();
  }
}

async function loadUsers() {
  if (!usersList || !state.session.canManageUsers) {
    return;
  }
  const response = await fetch("/api/admin/users");
  if (!response.ok) {
    return;
  }
  const payload = await response.json();
  const users = Array.isArray(payload.users) ? payload.users : [];
  usersList.innerHTML = users
    .map(
      (user) => `
        <div class="userRow" data-user-id="${escapeHtml(user.id)}">
          <span>${escapeHtml(user.username)}</span>
          <button class="headerActionButton deleteUserButton" type="button">Delete</button>
        </div>
      `,
    )
    .join("");
}

async function createUser(event) {
  event.preventDefault();
  if (!state.session.canManageUsers) {
    return;
  }
  const username = newUsernameInput.value.trim();
  const password = newPasswordInput.value;
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    window.alert("Failed to create user. Use a unique username and 8+ char password.");
    return;
  }
  newUsernameInput.value = "";
  newPasswordInput.value = "";
  await loadUsers();
}

async function deleteUser(userId) {
  if (!state.session.canManageUsers) {
    return;
  }
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    window.alert("Failed to delete user");
    return;
  }
  await loadUsers();
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
}

function matchesFilterValue(activeSet, value) {
  return activeSet.size === 0 || activeSet.has(value);
}

function matchesActiveFilters(item) {
  return (
    matchesFilterValue(state.filters.bearing, item.bearing) &&
    matchesFilterValue(state.filters.type, item.type)
  );
}

function getFilteredAlerts() {
  const alerts = state.snapshot?.alerts || [];
  return alerts.filter(matchesActiveFilters);
}

function getFilteredTracks() {
  const tracks = getActiveMapTracks();
  return tracks.filter(matchesActiveFilters);
}

function getActiveMapTracks() {
  if (state.timelineMode === "history") {
    return state.timelineTracks || [];
  }
  const tracks = state.snapshot?.tracks || [];
  const windowMs = state.mapWindowSeconds * 1000;
  const nowMs = Date.now();
  return tracks.filter((track) => nowMs - track.timestampMs <= windowMs);
}

function updateTimelineControls() {
  if (!timelineSlider || !timelineCurrentLabel || !timelineLiveButton) {
    return;
  }
  const now = new Date();
  const today = formatDateKey(now);
  if (!state.timelineDate) {
    state.timelineDate = today;
  }
  const maxTimelineSecond = getMaxTimelineSecond(state.timelineDate);
  if (state.timelineMode === "live" && !state.timelineDragging) {
    state.timelineSecond = maxTimelineSecond;
  } else if (!state.timelineDragging) {
    state.timelineSecond = Math.min(state.timelineSecond, maxTimelineSecond);
  }
  timelineSlider.max = "86399";
  if (!state.timelineDragging) {
    timelineSlider.value = String(state.timelineSecond);
  }
  timelineCurrentLabel.textContent =
    state.timelineMode === "live"
      ? `Live ${formatSecondOfDay(state.timelineSecond)}`
      : `${state.timelineDate} ${formatSecondOfDay(state.timelineSecond)}`;
  timelineLiveButton.classList.toggle("isLive", state.timelineMode === "live");
  timelineLiveButton.setAttribute(
    "aria-pressed",
    state.timelineMode === "live" ? "true" : "false",
  );
  mapWindowButtons?.querySelectorAll(".mapWindowButton").forEach((button) => {
    button.classList.toggle(
      "active",
      Number(button.dataset.windowSeconds) === state.mapWindowSeconds,
    );
  });
}

async function loadTimelineDates() {
  if (!timelineDateSelect) {
    return;
  }
  const today = formatDateKey(new Date());
  let dates = [today];
  if (state.session.mode === "full") {
    try {
      const response = await fetch("/api/timeline/dates");
      if (response.ok) {
        const payload = await response.json();
        dates = Array.from(new Set([today, ...(payload.dates || [])]));
      }
    } catch {
      dates = [today];
    }
  }
  timelineDateSelect.innerHTML = dates
    .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
    .join("");
  state.timelineDate = dates.includes(state.timelineDate) ? state.timelineDate : today;
  timelineDateSelect.value = state.timelineDate;
}

let timelineLoadTimer = null;

function scheduleTimelineLoad() {
  if (timelineLoadTimer) {
    window.clearTimeout(timelineLoadTimer);
  }
  timelineLoadTimer = window.setTimeout(() => {
    timelineLoadTimer = null;
    void loadTimelineTracks();
  }, 180);
}

async function loadTimelineTracks() {
  if (state.timelineMode !== "history") {
    return;
  }
  if (state.session.mode !== "full") {
    state.timelineTracks = [];
    renderMap();
    return;
  }
  const requestId = state.timelineRequestId + 1;
  state.timelineRequestId = requestId;
  state.timelineLoading = true;
  const params = new URLSearchParams({
    date: state.timelineDate,
    second: String(state.timelineSecond),
    window_seconds: String(state.mapWindowSeconds),
  });
  try {
    const response = await fetch(`/api/timeline?${params.toString()}`);
    if (!response.ok || state.timelineRequestId !== requestId) {
      return;
    }
    const payload = await response.json();
    state.timelineTracks = payload.tracks || [];
  } finally {
    state.timelineLoading = false;
    updateTimelineControls();
    renderMap();
  }
}

function enterLiveMode() {
  state.timelineMode = "live";
  state.timelineTracks = null;
  state.timelineDate = formatDateKey(new Date());
  state.timelineSecond = getLocalSecondOfDay();
  if (timelineDateSelect) {
    timelineDateSelect.value = state.timelineDate;
  }
  updateTimelineControls();
  renderMap();
}

function enterHistoryMode(date, second) {
  state.timelineMode = "history";
  state.timelineDate = date;
  state.timelineSecond = Math.min(Math.max(0, second), getMaxTimelineSecond(date));
  updateTimelineControls();
  scheduleTimelineLoad();
}

function updateUpstreamUrlInput() {
  if (document.activeElement !== upstreamUrlInput) {
    upstreamUrlInput.value = state.upstreamUrl;
  }
}

async function loadUpstreamUrl() {
  const response = await fetch("/api/config/upstream-websocket");
  if (!response.ok) {
    throw new Error(`Failed to load websocket URL (${response.status})`);
  }

  const payload = await response.json();
  state.upstreamUrl =
    payload?.editable && typeof payload?.url === "string" ? payload.url : "";
  updateUpstreamUrlInput();
}

async function applyUpstreamUrl() {
  if (state.session.canConfigureWebsocket === false) {
    return;
  }

  const nextUrl = normalizeUpstreamUrl(upstreamUrlInput.value);
  state.upstreamUrl = nextUrl;
  updateUpstreamUrlInput();
  lastMessage.textContent = nextUrl
    ? `Connecting to ${nextUrl}`
    : "No messages received yet";
  applyUpstreamUrlButton.disabled = true;

  try {
    const response = await fetch("/api/config/upstream-websocket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: nextUrl }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update websocket URL (${response.status}): ${errorText}`,
      );
    }

    const payload = await response.json();
    state.upstreamUrl = typeof payload?.url === "string" ? payload.url : nextUrl;
    updateUpstreamUrlInput();
  } catch (error) {
    window.alert(
      error instanceof Error ? error.message : "Failed to update websocket URL",
    );
  } finally {
    applyUpstreamUrlButton.disabled = false;
  }
}

async function clearAlerts() {
  if (state.session.canClear === false) {
    return;
  }

  if (clearAlertsButton.disabled) {
    return;
  }

  clearAlertsButton.disabled = true;
  try {
    const response = await fetch("/api/alerts/clear", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Failed to clear alerts (${response.status})`);
    }
  } catch (error) {
    clearAlertsButton.disabled = !(state.snapshot?.alerts || []).length;
    window.alert(error instanceof Error ? error.message : "Failed to clear alerts");
  }
}

async function loadSampleSnapshotDataUrl() {
  const response = await fetch("/static/assets/sample-striped-640x480.png");
  if (!response.ok) {
    throw new Error(`Failed to load sample image (${response.status})`);
  }

  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function pushDemoAlert() {
  if (state.session.canDemo === false) {
    return;
  }

  if (pushDemoAlertButton.disabled) {
    return;
  }

  pushDemoAlertButton.disabled = true;

  try {
    const sampleSnapshot = await loadSampleSnapshotDataUrl();
    const demoAlert = DEMO_ALERTS[state.demoAlertIndex % DEMO_ALERTS.length];
    const payload = {
      datetime: new Date().toISOString(),
      snapshots: {
        T2: sampleSnapshot,
      },
      objects: [demoAlert],
    };

    const response = await fetch("/api/mock-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Failed to push demo alert (${response.status})`);
    }
    state.demoAlertIndex += 1;
  } catch (error) {
    window.alert(
      error instanceof Error ? error.message : "Failed to push demo alert",
    );
  } finally {
    pushDemoAlertButton.disabled = false;
  }
}

function getAlertById(alertId) {
  return (
    (state.snapshot?.alerts || []).find((alert) => alert.id === alertId) || null
  );
}

function getAvailableViews(alert) {
  const views = [];
  if (alert?.thermalUrl) views.push("thermal");
  if (alert?.rgbUrl) views.push("rgb");
  return views;
}

function getAlertMedia(alert, requestedView = null) {
  if (!alert) {
    return null;
  }

  const availableViews = getAvailableViews(alert);
  if (availableViews.length === 0) {
    return { view: null, url: null, boundingBox: null };
  }

  let activeView = requestedView;
  if (!activeView || !availableViews.includes(activeView)) {
    activeView =
      alert.preferredView && availableViews.includes(alert.preferredView)
        ? alert.preferredView
        : availableViews[0];
  }

  if (activeView === "thermal") {
    return {
      view: "thermal",
      url: alert.thermalUrl,
      boundingBox: alert.thermalBoundingBox || null,
    };
  }

  return {
    view: "rgb",
    url: alert.rgbUrl,
    boundingBox: alert.rgbBoundingBox || null,
  };
}

function renderThumbnail(alert) {
  if (!alert.thumbnailUrl) {
    return '<div class="thumbnailPlaceholder">No image</div>';
  }

  const hasBoundingBox =
    Array.isArray(alert.boundingBox) && alert.boundingBox.length === 4;
  if (hasBoundingBox) {
    const bboxValue = alert.boundingBox
      .map((value) => Number(value).toFixed(6))
      .join(",");
    return `
      <div class="croppedThumbnail" data-bbox="${bboxValue}">
        <img src="${escapeHtml(alert.thumbnailUrl)}" alt="Alert thumbnail" class="croppedThumbnailImage" loading="lazy" />
        <div class="thumbnailLoadingOverlay"></div>
      </div>
    `;
  }

  return `<img src="${escapeHtml(alert.thumbnailUrl)}" alt="Alert thumbnail" class="thumbnailImage" loading="lazy" />`;
}

function applyCroppedThumbnail(container) {
  const image = container.querySelector("img");
  if (!image || !image.naturalWidth || !image.naturalHeight) {
    return;
  }

  const bbox = (container.dataset.bbox || "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (bbox.length !== 4) {
    container.classList.add("ready");
    return;
  }

  const [x1, y1, x2, y2] = bbox;
  const width = container.clientWidth || 80;
  const height = container.clientHeight || 60;
  const naturalAspectRatio = image.naturalWidth / image.naturalHeight;

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const boxWidth = Math.abs(x2 - x1) || 0.1;
  const boxHeight = Math.abs(y2 - y1) || 0.1;

  const padding = 10;
  const targetWidth = width - padding * 2;
  const targetHeight = height - padding * 2;
  const requiredWidthByX = targetWidth / boxWidth;
  const requiredWidthByY = (targetHeight / boxHeight) * naturalAspectRatio;
  const finalWidth = Math.min(requiredWidthByX, requiredWidthByY);
  const finalHeight = finalWidth / naturalAspectRatio;

  const actualBoxWidth = boxWidth * finalWidth;
  const actualBoxHeight = boxHeight * finalHeight;
  const offsetX =
    padding + (targetWidth - actualBoxWidth) / 2 - minX * finalWidth;
  const offsetY =
    padding + (targetHeight - actualBoxHeight) / 2 - minY * finalHeight;

  image.style.width = `${finalWidth}px`;
  image.style.height = `${finalHeight}px`;
  image.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  container.classList.add("ready");
}

function initializeAlertMedia() {
  alertsList.querySelectorAll(".croppedThumbnail").forEach((container) => {
    const image = container.querySelector("img");
    if (!image) {
      return;
    }

    const apply = () => applyCroppedThumbnail(container);
    if (image.complete && image.naturalWidth > 0) {
      apply();
    } else {
      image.addEventListener("load", apply, { once: true });
      image.addEventListener(
        "error",
        () => {
          container.innerHTML =
            '<div class="thumbnailPlaceholder">No image</div>';
        },
        { once: true },
      );
    }
  });
}

function getAlertScrollAnchor() {
  const scrollTop = alertsList.scrollTop;
  const cards = Array.from(alertsList.querySelectorAll("[data-alert-id]"));
  const anchor = cards.find(
    (card) => card.offsetTop + card.offsetHeight >= scrollTop,
  );
  if (!anchor) {
    return null;
  }
  return {
    alertId: anchor.dataset.alertId,
    offsetFromScrollTop: anchor.offsetTop - scrollTop,
  };
}

function restoreAlertScrollAnchor(anchor, fallbackScrollTop) {
  if (!anchor?.alertId) {
    alertsList.scrollTop = fallbackScrollTop;
    return;
  }
  const nextAnchor = Array.from(
    alertsList.querySelectorAll("[data-alert-id]"),
  ).find((card) => card.dataset.alertId === anchor.alertId);
  if (!nextAnchor) {
    alertsList.scrollTop = fallbackScrollTop;
    return;
  }
  alertsList.scrollTop = nextAnchor.offsetTop - anchor.offsetFromScrollTop;
}

function renderAlerts() {
  const allAlerts = state.snapshot?.alerts || [];
  syncAlertNotifications(allAlerts);
  const alerts = getFilteredAlerts();
  const previousScrollTop = alertsList.scrollTop;
  const shouldPreserveScroll = previousScrollTop > 24;
  const scrollAnchor = shouldPreserveScroll ? getAlertScrollAnchor() : null;
  const totalAlertCount = Number.isFinite(state.snapshot?.alertsTotal)
    ? state.snapshot.alertsTotal
    : alerts.length;
  const signature = alerts
    .map((alert) => {
      const bbox = Array.isArray(alert.boundingBox)
        ? alert.boundingBox.join(",")
        : "";
      return [
        alert.id,
        alert.timestampMs,
        alert.thumbnailUrl || "",
        alert.rgbUrl || "",
        alert.thermalUrl || "",
        bbox,
      ].join(":");
    })
    .join("|");

  if (signature === state.lastAlertsSignature) {
    alertCount.textContent = String(totalAlertCount);
    alertsEmpty.style.display = alerts.length ? "none" : "flex";
    return;
  }

  state.lastAlertsSignature = signature;
  alertCount.textContent = String(totalAlertCount);
  alertsEmpty.style.display = alerts.length ? "none" : "flex";

  alertsList.innerHTML = alerts
    .map(
      (alert, index) => `
        <article class="card ${index === 0 ? "isNew" : ""}" data-alert-id="${escapeHtml(alert.id)}" role="button" tabindex="0">
          <div class="mainSection">
            <div class="thumbnail">${renderThumbnail(alert)}</div>
            <div class="content">
              <div class="cardHeader">
                <span class="alertId">#${escapeHtml(alert.trackId)}</span>
                <span class="typeBadge ${escapeHtml(alert.type)}">${escapeHtml(alert.typeLabel)}</span>
              </div>
              <div class="details">
                <span class="label">Bearing</span>
                <span class="value">${escapeHtml(alert.bearing)}</span>
                <span class="label">Confidence</span>
                <span class="valueHighlight">${escapeHtml(alert.confidence)}%</span>
                <span class="label">Distance</span>
                <span class="value">${escapeHtml(alert.distanceM)}m</span>
              </div>
              <div class="timestamp">${escapeHtml(formatTimestamp(alert.timestampMs))}</div>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  initializeAlertMedia();

  if (shouldPreserveScroll) {
    restoreAlertScrollAnchor(scrollAnchor, previousScrollTop);
  }
}

async function loadMoreAlerts() {
  if (state.session.mode !== "full" || state.isLoadingMoreAlerts) {
    return;
  }
  const currentAlerts = state.snapshot?.alerts || [];
  if (!state.snapshot?.hasMoreAlerts) {
    return;
  }
  state.isLoadingMoreAlerts = true;
  try {
    const response = await fetch(
      `/api/alerts?offset=${currentAlerts.length}&limit=${state.snapshot.alertsLimit || 30}`,
    );
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const existingIds = new Set(currentAlerts.map((alert) => alert.id));
    const nextAlerts = (payload.alerts || []).filter(
      (alert) => !existingIds.has(alert.id),
    );
    nextAlerts.forEach((alert) => state.knownAlertIds.add(alert.id));
    state.snapshot.alerts = [...currentAlerts, ...nextAlerts];
    state.snapshot.hasMoreAlerts = Boolean(payload.hasMore);
    state.snapshot.alertsTotal = payload.total;
    renderAlerts();
  } finally {
    state.isLoadingMoreAlerts = false;
  }
}

function maybeLoadMoreAlerts() {
  const remaining = alertsList.scrollHeight - alertsList.scrollTop - alertsList.clientHeight;
  if (remaining < 160) {
    void loadMoreAlerts();
  }
}

function getGeometry(root, maxDistanceM) {
  const width = root.clientWidth || 1;
  const height = root.clientHeight || 1;
  const originX = width / 2;
  const originY = height * 0.78;
  const radius = Math.max(80, Math.min(width * 0.46, originY - 18));
  const scale = radius / maxDistanceM;
  return { width, height, originX, originY, radius, scale };
}

function polarToPoint(distanceM, angleDeg, geometry, maxDistanceM) {
  const clamped = Math.max(0, Math.min(distanceM, maxDistanceM));
  const radius = clamped * geometry.scale;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: geometry.originX + Math.sin(angleRad) * radius,
    y: geometry.originY - Math.cos(angleRad) * radius,
  };
}

function createArcPath(cx, cy, radius, startDeg, endDeg, includeOrigin = true) {
  const points = [];
  for (let degree = startDeg; degree <= endDeg; degree += 4) {
    const angle = (degree * Math.PI) / 180;
    points.push([cx + Math.sin(angle) * radius, cy - Math.cos(angle) * radius]);
  }
  points.push([
    cx + Math.sin((endDeg * Math.PI) / 180) * radius,
    cy - Math.cos((endDeg * Math.PI) / 180) * radius,
  ]);

  const first = points[0];
  const body = points
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  if (!includeOrigin) {
    return `M ${first[0].toFixed(2)} ${first[1].toFixed(2)} L ${body}`;
  }
  return `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${body} L ${cx.toFixed(2)} ${cy.toFixed(2)} Z`;
}

function appendSvgElement(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  mapSvg.appendChild(node);
  return node;
}

function clampMapTranslation(scale, translateX, translateY) {
  const width = mapRoot.clientWidth || 1;
  const height = mapRoot.clientHeight || 1;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  const minX =
    scaledWidth > width ? width - scaledWidth : (width - scaledWidth) / 2;
  const maxX = scaledWidth > width ? 0 : (width - scaledWidth) / 2;
  const minY =
    scaledHeight > height ? height - scaledHeight : (height - scaledHeight) / 2;
  const maxY = scaledHeight > height ? 0 : (height - scaledHeight) / 2;

  return {
    x: Math.min(maxX, Math.max(minX, translateX)),
    y: Math.min(maxY, Math.max(minY, translateY)),
  };
}

function applyMapTransform() {
  const { scale, translateX, translateY } = state.mapView;
  const clamped = clampMapTranslation(scale, translateX, translateY);
  state.mapView.translateX = clamped.x;
  state.mapView.translateY = clamped.y;
  mapStage.style.transform = `translate(${clamped.x}px, ${clamped.y}px) scale(${scale})`;
  mapRoot.style.setProperty("--marker-scale", getMarkerScale().toFixed(3));
}

function getMarkerScale() {
  const zoomScale = state.mapView.scale || 1;
  return 1.12 / zoomScale;
}

function getTrackDotSize() {
  const zoomScale = state.mapView.scale || 1;
  return {
    radius: 3 / zoomScale,
    strokeWidth: 1 / zoomScale,
  };
}

function getTrackTrailStyle() {
  const zoomScale = state.mapView.scale || 1;
  return {
    strokeWidth: 2 / zoomScale,
    dash: `${(4 / zoomScale).toFixed(2)} ${(4 / zoomScale).toFixed(2)}`,
  };
}

function renderBearingArrowMarkup(bearing) {
  if (bearing === "Approaching") {
    return '<span class="bearingArrow vertical down" aria-hidden="true"></span>';
  }
  if (bearing === "Departing") {
    return '<span class="bearingArrow vertical up" aria-hidden="true"></span>';
  }
  if (bearing === "Lateral Crossing") {
    return [
      '<span class="bearingArrow horizontal left" aria-hidden="true"></span>',
      '<span class="bearingArrow horizontal right" aria-hidden="true"></span>',
    ].join("");
  }
  return "";
}

function getAlertIdFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest("[data-alert-id]")?.dataset.alertId || null;
}

function renderMap() {
  const snapshot = state.snapshot;
  const tracks = getFilteredTracks();
  const maxDistanceM = snapshot?.map?.maxDistanceM || 1000;
  const trackWindowMs = state.mapWindowSeconds * 1000;
  const geometry = getGeometry(mapRoot, maxDistanceM);

  applyMapTransform();

  trackCount.textContent = String(tracks.length);
  mapEmpty.style.display = "none";
  mapSvg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
  mapSvg.innerHTML = "";
  mapOverlay.innerHTML = "";

  appendSvgElement("rect", {
    x: 0,
    y: 0,
    width: geometry.width,
    height: geometry.height,
    fill: "#111822",
  });

  appendSvgElement("path", {
    d: createArcPath(
      geometry.originX,
      geometry.originY,
      geometry.radius,
      -90,
      90,
      true,
    ),
    class: "frontWedge",
  });

  appendSvgElement("path", {
    d: createArcPath(
      geometry.originX,
      geometry.originY,
      geometry.radius * 0.55,
      90,
      270,
      true,
    ),
    class: "rearWedge",
  });

  appendSvgElement("line", {
    x1: 0,
    y1: geometry.originY,
    x2: geometry.width,
    y2: geometry.originY,
    class: "originLine",
  });

  [250, 500, 750, maxDistanceM].forEach((distance, index) => {
    const radius = distance * geometry.scale;
    appendSvgElement("path", {
      d: createArcPath(
        geometry.originX,
        geometry.originY,
        radius,
        -90,
        90,
        true,
      ),
      class: `ringOutline ${index === 0 ? "inner" : ""}`.trim(),
    });

    const label = appendSvgElement("text", {
      x: geometry.originX,
      y: geometry.originY - radius + 14,
      "text-anchor": "middle",
      class: "mapDistanceLabel",
    });
    label.textContent = `${distance}m`;
  });

  const camera = document.createElement("div");
  camera.className = "cameraMarker";
  camera.style.left = `${geometry.originX}px`;
  camera.style.top = `${geometry.originY}px`;
  camera.innerHTML = `
    <div class="cameraIconWrapper">
      <img class="cameraIcon" src="/static/assets/camera-icon.svg" alt="Camera" />
    </div>
  `;
  mapOverlay.appendChild(camera);

  const nowMs = Date.now();
  tracks
    .slice()
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .forEach((track) => {
      const ageMs = Math.max(0, nowMs - track.timestampMs);
      const opacity =
        state.timelineMode === "live"
          ? Math.max(0, Math.min(1, 1 - ageMs / trackWindowMs))
          : 1;
      if (opacity <= 0) {
        return;
      }

      const mappedPoints = track.positions.map((position) =>
        polarToPoint(position.distance, position.angle, geometry, maxDistanceM),
      );
      if (mappedPoints.length === 0) {
        return;
      }

      const polyline = appendSvgElement("polyline", {
        points: mappedPoints
          .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(" "),
        class: "trackTrail",
        opacity: opacity.toFixed(2),
      });
      const trailStyle = getTrackTrailStyle();
      polyline.style.strokeWidth = `${trailStyle.strokeWidth.toFixed(2)}px`;
      polyline.style.strokeDasharray = trailStyle.dash;
      polyline.setAttribute("fill", "none");

      mappedPoints.slice(0, -1).forEach((point) => {
        const dotSize = getTrackDotSize();
        appendSvgElement("circle", {
          cx: point.x.toFixed(2),
          cy: point.y.toFixed(2),
          r: dotSize.radius.toFixed(2),
          class: "trackDot",
          opacity: opacity.toFixed(2),
          style: `stroke-width: ${dotSize.strokeWidth.toFixed(2)}px`,
        });
      });

      const current = mappedPoints[mappedPoints.length - 1];
      const bearingClass = track.bearing.toLowerCase().replaceAll(" ", "-");
      const marker = document.createElement("div");
      marker.className = "trackedObjectMarker";
      marker.dataset.alertId = String(track.id);
      marker.style.left = `${current.x}px`;
      marker.style.top = `${current.y}px`;
      marker.style.opacity = opacity.toFixed(2);
      marker.title = `${track.typeLabel} #${track.trackId} | ${track.bearing} | ${track.confidence}%`;
      marker.innerHTML = `
        <div class="trackedObjectContent">
          <div class="trackedObjectId">#${escapeHtml(track.trackId)}</div>
          <div class="trackedObjectVisual bearing-${escapeHtml(bearingClass)}">
            <div class="trackedObjectBubble">
              <div class="markerIconInLabel">
                <img src="/static/assets/${escapeHtml(track.type)}.svg" class="trackedObjectIcon" alt="${escapeHtml(track.typeLabel)}" />
              </div>
              <span class="trackedObjectDistance">${Math.round(track.positions[track.positions.length - 1].distance)}m</span>
            </div>
            ${renderBearingArrowMarkup(track.bearing)}
          </div>
        </div>
      `;
      mapOverlay.appendChild(marker);

    });
}

function renderModalAlertMap(alert) {
  if (!modalAlertMap) {
    return;
  }
  modalAlertMap.innerHTML = "";
  if (!alert) {
    return;
  }
  const liveTrack = (state.snapshot?.tracks || []).find((item) => item.id === alert.id);
  const track = liveTrack || {
    id: alert.id,
    trackId: alert.trackId,
    type: alert.type,
    typeLabel: alert.typeLabel,
    bearing: alert.bearing,
    confidence: alert.confidence,
    positions: alert.positions || [{ distance: alert.distanceM, angle: alert.angleDeg }],
  };
  const width = modalAlertMap.clientWidth || 520;
  const height = modalAlertMap.clientHeight || 520;
  const maxDistanceM = state.snapshot?.map?.maxDistanceM || 1000;
  const geometry = {
    width,
    height,
    originX: width / 2,
    originY: height * 0.78,
    radius: Math.max(120, Math.min(width * 0.46, height * 0.7)),
  };
  geometry.scale = geometry.radius / maxDistanceM;

  const stage = document.createElement("div");
  stage.className = "modalMapStage";
  const overlay = document.createElement("div");
  overlay.className = "modalMapOverlay";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("mapSvg");
  stage.appendChild(svg);
  stage.appendChild(overlay);
  modalAlertMap.appendChild(stage);

  const append = (tag, attributes) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    svg.appendChild(node);
    return node;
  };
  append("rect", { x: 0, y: 0, width, height, fill: "#111822" });
  append("path", {
    d: createArcPath(geometry.originX, geometry.originY, geometry.radius, -90, 90, true),
    class: "frontWedge",
  });
  append("path", {
    d: createArcPath(geometry.originX, geometry.originY, geometry.radius * 0.55, 90, 270, true),
    class: "rearWedge",
  });
  append("line", {
    x1: 0,
    y1: geometry.originY,
    x2: width,
    y2: geometry.originY,
    class: "originLine",
  });

  [250, 500, 750, maxDistanceM].forEach((distance, index) => {
    const radius = distance * geometry.scale;
    append("path", {
      d: createArcPath(geometry.originX, geometry.originY, radius, -90, 90, true),
      class: `ringOutline ${index === 0 ? "inner" : ""}`.trim(),
    });
    const label = append("text", {
      x: geometry.originX,
      y: geometry.originY - radius + 14,
      "text-anchor": "middle",
      class: "mapDistanceLabel",
    });
    label.textContent = `${distance}m`;
  });

  const camera = document.createElement("div");
  camera.className = "cameraMarker";
  camera.style.left = `${geometry.originX}px`;
  camera.style.top = `${geometry.originY}px`;
  camera.innerHTML = `
    <div class="cameraIconWrapper">
      <img class="cameraIcon" src="/static/assets/camera-icon.svg" alt="Camera" />
    </div>
  `;
  overlay.appendChild(camera);

  const points = (track.positions || []).map((position) =>
    polarToPoint(position.distance, position.angle, geometry, maxDistanceM),
  );
  if (points.length > 1) {
    append("polyline", {
      points: points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
      class: "trackTrail",
      fill: "none",
      opacity: "1",
    });
  }
  points.slice(0, -1).forEach((point) => {
    append("circle", {
      cx: point.x.toFixed(2),
      cy: point.y.toFixed(2),
      r: 4,
      class: "trackDot",
    });
  });
  const current = points[points.length - 1];
  if (current) {
    const bearingClass = track.bearing.toLowerCase().replaceAll(" ", "-");
    const marker = document.createElement("div");
    marker.className = "trackedObjectMarker modalTrackedObjectMarker";
    marker.style.left = `${current.x}px`;
    marker.style.top = `${current.y}px`;
    marker.title = `${track.typeLabel} #${track.trackId} | ${track.bearing} | ${track.confidence}%`;
    marker.innerHTML = `
      <div class="trackedObjectContent">
        <div class="trackedObjectId">#${escapeHtml(track.trackId)}</div>
        <div class="trackedObjectVisual bearing-${escapeHtml(bearingClass)}">
          <div class="trackedObjectBubble">
            <div class="markerIconInLabel">
              <img src="/static/assets/${escapeHtml(track.type)}.svg" class="trackedObjectIcon" alt="${escapeHtml(track.typeLabel)}" />
            </div>
            <span class="trackedObjectDistance">${Math.round(track.positions[track.positions.length - 1].distance)}m</span>
          </div>
          ${renderBearingArrowMarkup(track.bearing)}
        </div>
      </div>
    `;
    overlay.appendChild(marker);
  }
  applyModalMapTransform();
}

function clampModalMapTranslation(scale, translateX, translateY) {
  const width = modalAlertMap.clientWidth || 1;
  const height = modalAlertMap.clientHeight || 1;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const minX = scaledWidth > width ? width - scaledWidth : (width - scaledWidth) / 2;
  const maxX = scaledWidth > width ? 0 : (width - scaledWidth) / 2;
  const minY = scaledHeight > height ? height - scaledHeight : (height - scaledHeight) / 2;
  const maxY = scaledHeight > height ? 0 : (height - scaledHeight) / 2;
  return {
    x: Math.min(maxX, Math.max(minX, translateX)),
    y: Math.min(maxY, Math.max(minY, translateY)),
  };
}

function applyModalMapTransform() {
  const stage = modalAlertMap?.querySelector(".modalMapStage");
  if (!stage) {
    return;
  }
  const { scale, translateX, translateY } = state.modalMapView;
  const clamped = clampModalMapTranslation(scale, translateX, translateY);
  state.modalMapView.translateX = clamped.x;
  state.modalMapView.translateY = clamped.y;
  stage.style.transform = `translate(${clamped.x}px, ${clamped.y}px) scale(${scale})`;
  modalAlertMap.style.setProperty("--marker-scale", (1.12 / scale).toFixed(3));
}

function zoomModalMap(clientX, clientY, nextScale) {
  if (!modalAlertMap || !modalAlertMap.querySelector(".modalMapStage")) {
    return;
  }
  const rect = modalAlertMap.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const { scale, translateX, translateY, minScale, maxScale } = state.modalMapView;
  const clampedScale = Math.min(maxScale, Math.max(minScale, nextScale));
  if (clampedScale === scale) {
    return;
  }
  const worldX = (px - translateX) / scale;
  const worldY = (py - translateY) / scale;
  state.modalMapView.scale = clampedScale;
  state.modalMapView.translateX = px - worldX * clampedScale;
  state.modalMapView.translateY = py - worldY * clampedScale;
  applyModalMapTransform();
}

function resetModalMapView() {
  state.modalMapView.scale = 1;
  state.modalMapView.translateX = 0;
  state.modalMapView.translateY = 0;
  applyModalMapTransform();
}

function stopModalMapPan(event) {
  if (state.modalMapView.pointerId !== event.pointerId) {
    return;
  }
  if (modalAlertMap.hasPointerCapture(event.pointerId)) {
    modalAlertMap.releasePointerCapture(event.pointerId);
  }
  state.modalMapView.pointerId = null;
  modalAlertMap.classList.remove("isPanning");
}

function renderModalToggle(alert) {
  const views = getAvailableViews(alert);
  if (views.length < 2) {
    modalViewToggle.hidden = true;
    modalViewToggle.innerHTML = "";
    return;
  }

  modalViewToggle.hidden = false;
  modalViewToggle.innerHTML = views
    .map(
      (view) => `
        <button type="button" class="modalViewButton ${state.modalView === view ? "active" : ""}" data-view="${view}">
          ${view === "thermal" ? "Thermal" : "RGB"}
        </button>
      `,
    )
    .join("");
}

function updateBoundingBoxOverlay(boundingBox) {
  if (!Array.isArray(boundingBox) || boundingBox.length !== 4) {
    modalBoundingBox.hidden = true;
    return;
  }

  const [x1, y1, x2, y2] = boundingBox;
  const left = Math.min(x1, x2) * 100;
  const top = Math.min(y1, y2) * 100;
  const width = Math.abs(x2 - x1) * 100;
  const height = Math.abs(y2 - y1) * 100;

  modalBoundingBox.style.left = `${left}%`;
  modalBoundingBox.style.top = `${top}%`;
  modalBoundingBox.style.width = `${width}%`;
  modalBoundingBox.style.height = `${height}%`;
  modalBoundingBox.hidden = false;
}

function applyBoundingBoxStrokeScale(scale) {
  const visualThickness = Math.max(1.5, Math.min(5, 1.5 + (scale - 1) * 0.2));
  const borderWidth = visualThickness / scale;
  const borderRadius = Math.max(1, 2 / scale);

  modalBoundingBox.style.setProperty("--bbox-border-width", `${borderWidth}px`);
  modalBoundingBox.style.setProperty(
    "--bbox-border-radius",
    `${borderRadius}px`,
  );
}

function applyModalTransform() {
  const {
    baseScale,
    baseTranslateX,
    baseTranslateY,
    scale,
    translateX,
    translateY,
  } = state.modalImageView;
  const totalScale = baseScale * scale;
  const totalTranslateX = baseTranslateX + translateX;
  const totalTranslateY = baseTranslateY + translateY;

  modalZoomWrapper.style.transform = `translate(${totalTranslateX}px, ${totalTranslateY}px) scale(${totalScale})`;
  applyBoundingBoxStrokeScale(totalScale);
}

function resetModalImageView() {
  state.modalImageView.scale = 1;
  state.modalImageView.translateX = 0;
  state.modalImageView.translateY = 0;
  state.modalImageView.pointerId = null;
  state.modalImageView.dragMoved = false;
  modalImageContainer.classList.remove("isPanning");
}

function updateModalLayout() {
  const alert = getAlertById(state.modalAlertId);
  if (!alert || modalOverlay.hidden) {
    return;
  }

  const activeMedia = getAlertMedia(alert, state.modalView);
  if (!activeMedia?.url || !modalImage.complete || !modalImage.naturalWidth) {
    return;
  }

  const naturalWidth = modalImage.naturalWidth;
  const naturalHeight = modalImage.naturalHeight;
  const containerWidth = modalImageContainer.clientWidth;
  const containerHeight = modalImageContainer.clientHeight;
  if (!containerWidth || !containerHeight) {
    return;
  }

  let scale;
  let offsetX;
  let offsetY;
  const fitScale = Math.min(
    containerWidth / naturalWidth,
    containerHeight / naturalHeight,
  );

  if (
    Array.isArray(activeMedia.boundingBox) &&
    activeMedia.boundingBox.length === 4
  ) {
    const [x1, y1, x2, y2] = activeMedia.boundingBox;
    const boxWidth = Math.abs(x2 - x1) || 0.1;
    const boxHeight = Math.abs(y2 - y1) || 0.1;
    const targetWidth = containerWidth * 0.5;
    const targetHeight = containerHeight * 0.5;
    const boxWidthPx = boxWidth * naturalWidth;
    const boxHeightPx = boxHeight * naturalHeight;

    scale = Math.min(targetWidth / boxWidthPx, targetHeight / boxHeightPx);
    scale = Math.max(scale, fitScale);
    scale = Math.min(scale, 5);

    const boxCenterX = ((x1 + x2) / 2) * naturalWidth;
    const boxCenterY = ((y1 + y2) / 2) * naturalHeight;
    offsetX = containerWidth / 2 - boxCenterX * scale;
    offsetY = containerHeight / 2 - boxCenterY * scale;
  } else {
    scale = Math.min(
      containerWidth / naturalWidth,
      containerHeight / naturalHeight,
    );
    offsetX = (containerWidth - naturalWidth * scale) / 2;
    offsetY = (containerHeight - naturalHeight * scale) / 2;
  }

  state.modalImageView.baseScale = scale;
  state.modalImageView.fitScale = fitScale;
  state.modalImageView.baseTranslateX = offsetX;
  state.modalImageView.baseTranslateY = offsetY;
  state.modalImageView.minScale = Math.min(1, fitScale / scale);
  modalZoomWrapper.style.width = `${naturalWidth}px`;
  modalZoomWrapper.style.height = `${naturalHeight}px`;
  applyModalTransform();
  updateBoundingBoxOverlay(activeMedia.boundingBox);
}

function renderModal() {
  if (!state.modalAlertId) {
    modalOverlay.hidden = true;
    modalOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modalOpen");
    return;
  }

  const alert = getAlertById(state.modalAlertId);
  if (!alert) {
    closeModal();
    return;
  }

  const activeMedia = getAlertMedia(alert, state.modalView);
  state.modalView = activeMedia?.view || null;
  const sourceKey = activeMedia?.url || null;
  if (state.modalImageView.sourceKey !== sourceKey) {
    state.modalImageView.sourceKey = sourceKey;
    resetModalImageView();
  }
  modalOverlay.hidden = false;
  modalOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modalOpen");
  requestAnimationFrame(() => renderModalAlertMap(alert));
  renderModalToggle(alert);

  if (!activeMedia?.url) {
    modalEmpty.hidden = false;
    modalZoomWrapper.hidden = true;
    modalBoundingBox.hidden = true;
    modalImage.removeAttribute("src");
    return;
  }

  modalEmpty.hidden = true;
  modalZoomWrapper.hidden = false;
  modalBoundingBox.hidden = true;
  modalImage.alt = `${alert.typeLabel} alert`;

  if (modalImage.dataset.activeSrc !== activeMedia.url) {
    modalImage.dataset.activeSrc = activeMedia.url;
    modalImage.src = activeMedia.url;
  }

  if (modalImage.complete && modalImage.naturalWidth > 0) {
    requestAnimationFrame(updateModalLayout);
  }
}

function openModal(alertId) {
  const alert = getAlertById(alertId);
  if (!alert) {
    return;
  }

  state.modalAlertId = alertId;
  state.modalView =
    alert.preferredView || (alert.thermalUrl ? "thermal" : "rgb");
  renderModal();
}

function closeModal() {
  state.modalAlertId = null;
  state.modalView = null;
  state.modalImageView.sourceKey = null;
  resetModalImageView();
  resetModalMapView();
  renderModalAlertMap(null);
  modalOverlay.hidden = true;
  modalOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modalOpen");
}

function zoomModalImage(clientX, clientY, nextScale) {
  if (modalZoomWrapper.hidden || !modalImage.complete || !modalImage.naturalWidth) {
    return;
  }

  const rect = modalImageContainer.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const { baseScale, baseTranslateX, baseTranslateY, scale, minScale, maxScale } =
    state.modalImageView;
  const clampedScale = Math.min(maxScale, Math.max(minScale, nextScale));
  if (clampedScale === scale) {
    return;
  }

  const totalScale = baseScale * scale;
  const totalTranslateX = baseTranslateX + state.modalImageView.translateX;
  const totalTranslateY = baseTranslateY + state.modalImageView.translateY;
  const imageX = (px - totalTranslateX) / totalScale;
  const imageY = (py - totalTranslateY) / totalScale;
  const nextTotalScale = baseScale * clampedScale;

  state.modalImageView.scale = clampedScale;
  state.modalImageView.translateX = px - imageX * nextTotalScale - baseTranslateX;
  state.modalImageView.translateY = py - imageY * nextTotalScale - baseTranslateY;
  applyModalTransform();
}

function resetModalZoom() {
  resetModalImageView();
  applyModalTransform();
}

function zoomMap(clientX, clientY, nextScale) {
  const rect = mapRoot.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const { scale, translateX, translateY, minScale, maxScale } = state.mapView;
  const clampedScale = Math.min(maxScale, Math.max(minScale, nextScale));
  if (clampedScale === scale) {
    return;
  }

  const worldX = (px - translateX) / scale;
  const worldY = (py - translateY) / scale;
  state.mapView.scale = clampedScale;
  state.mapView.translateX = px - worldX * clampedScale;
  state.mapView.translateY = py - worldY * clampedScale;
  applyMapTransform();
}

function resetMapView() {
  state.mapView.scale = 1;
  state.mapView.translateX = 0;
  state.mapView.translateY = 0;
  applyMapTransform();
}

function renderAll() {
  if (!state.snapshot) {
    return;
  }
  applyViewerPermissions(state.snapshot);
  updateStatus(state.snapshot);
  renderAlerts();
  renderMap();
  renderModal();
}

function mergeIncomingSnapshot(nextSnapshot) {
  if (
    nextSnapshot?.viewer?.mode !== "full" ||
    !Array.isArray(nextSnapshot.alerts) ||
    !Array.isArray(state.snapshot?.alerts)
  ) {
    return nextSnapshot;
  }

  const incomingIds = new Set(
    nextSnapshot.alerts.map((alert) => String(alert.id)),
  );
  const retainedOlderAlerts = state.snapshot.alerts.filter(
    (alert) => !incomingIds.has(String(alert.id)),
  );
  const mergedAlerts = [...nextSnapshot.alerts, ...retainedOlderAlerts];
  const total = Number.isFinite(nextSnapshot.alertsTotal)
    ? nextSnapshot.alertsTotal
    : mergedAlerts.length;

  return {
    ...nextSnapshot,
    alerts: mergedAlerts.slice(0, total),
    hasMoreAlerts: mergedAlerts.length < total || Boolean(nextSnapshot.hasMoreAlerts),
  };
}

async function bootstrap() {
  await loadSession();
  await loadTimelineDates();
  const [stateResponse, configResponse] = await Promise.all([
    fetch("/api/state"),
    fetch("/api/config/upstream-websocket"),
  ]);
  state.snapshot = await stateResponse.json();
  const configPayload = await configResponse.json();
  state.upstreamUrl =
    typeof configPayload?.url === "string" ? configPayload.url : "";
  updateUpstreamUrlInput();
  enterLiveMode();
  renderAll();
}

function updateFiltersFromInputs() {
  const checkedInputs = filterPanel.querySelectorAll("input[type='checkbox']:checked");
  state.filters.bearing = new Set();
  state.filters.type = new Set();

  checkedInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input.name === "bearing") {
      state.filters.bearing.add(input.value);
    }

    if (input.name === "type") {
      state.filters.type.add(input.value);
    }
  });
}

function connectSocket() {
  if (
    state.uiSocket &&
    [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.uiSocket.readyState)
  ) {
    return;
  }

  if (state.uiSocketReconnectTimer) {
    window.clearTimeout(state.uiSocketReconnectTimer);
    state.uiSocketReconnectTimer = null;
  }

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${window.location.host}/ws/ui`);
  state.uiSocket = socket;

  socket.addEventListener("open", () => {
    state.uiSocketRetryMs = 1000;
    state.uiSocketLastMessageAt = Date.now();
    startSocketWatchdog();
  });

  socket.addEventListener("message", (event) => {
    state.uiSocketLastMessageAt = Date.now();
    state.snapshot = mergeIncomingSnapshot(JSON.parse(event.data));
    renderAll();
  });

  socket.addEventListener("error", () => {
    socket.close();
  });

  socket.addEventListener("close", () => {
    if (state.uiSocket === socket) {
      state.uiSocket = null;
    }
    stopSocketWatchdog();
    scheduleSocketReconnect();
  });
}

function scheduleSocketReconnect() {
  if (state.uiSocketReconnectTimer) {
    return;
  }
  const delay = state.uiSocketRetryMs;
  state.uiSocketRetryMs = Math.min(state.uiSocketRetryMs * 1.6, 15000);
  state.uiSocketReconnectTimer = window.setTimeout(() => {
    state.uiSocketReconnectTimer = null;
    connectSocket();
  }, delay);
}

function startSocketWatchdog() {
  stopSocketWatchdog();
  state.uiSocketWatchdogTimer = window.setInterval(() => {
    const socket = state.uiSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (Date.now() - state.uiSocketLastMessageAt > 75000) {
      socket.close();
    }
  }, 15000);
}

function stopSocketWatchdog() {
  if (state.uiSocketWatchdogTimer) {
    window.clearInterval(state.uiSocketWatchdogTimer);
    state.uiSocketWatchdogTimer = null;
  }
}

alertsList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-alert-id]");
  if (!card) {
    return;
  }
  openModal(card.dataset.alertId);
});

clearAlertsButton.addEventListener("click", clearAlerts);
pushDemoAlertButton.addEventListener("click", pushDemoAlert);
applyUpstreamUrlButton.addEventListener("click", applyUpstreamUrl);
alertsList.addEventListener("scroll", maybeLoadMoreAlerts);
mapWindowButtons?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-window-seconds]");
  if (!button) {
    return;
  }
  state.mapWindowSeconds = Number(button.dataset.windowSeconds) || 60;
  updateTimelineControls();
  if (state.timelineMode === "history") {
    scheduleTimelineLoad();
  } else {
    renderMap();
  }
});
timelineDateSelect?.addEventListener("change", () => {
  enterHistoryMode(
    timelineDateSelect.value,
    Math.min(Number(timelineSlider.value) || 0, getMaxTimelineSecond(timelineDateSelect.value)),
  );
});
timelineSlider?.addEventListener("input", () => {
  enterHistoryMode(
    timelineDateSelect?.value || formatDateKey(new Date()),
    Number(timelineSlider.value) || 0,
  );
});
timelineSlider?.addEventListener("pointerdown", () => {
  state.timelineDragging = true;
  state.timelineMode = "history";
  timelineLiveButton?.classList.remove("isLive");
});
timelineSlider?.addEventListener("pointerup", () => {
  state.timelineDragging = false;
  enterHistoryMode(
    timelineDateSelect?.value || formatDateKey(new Date()),
    Number(timelineSlider.value) || 0,
  );
});
timelineSlider?.addEventListener("pointercancel", () => {
  state.timelineDragging = false;
});
timelineSlider?.addEventListener("change", () => {
  state.timelineDragging = false;
  enterHistoryMode(
    timelineDateSelect?.value || formatDateKey(new Date()),
    Number(timelineSlider.value) || 0,
  );
});
timelineLiveButton?.addEventListener("click", enterLiveMode);
if (createUserForm) {
  createUserForm.addEventListener("submit", createUser);
}
if (usersList) {
  usersList.addEventListener("click", (event) => {
    const button = event.target.closest(".deleteUserButton");
    const row = event.target.closest("[data-user-id]");
    if (button && row?.dataset.userId) {
      void deleteUser(row.dataset.userId);
    }
  });
}
if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}
filterPanel.addEventListener("change", () => {
  updateFiltersFromInputs();
  renderAll();
});
upstreamUrlInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  void applyUpstreamUrl();
});

alertsList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const card = event.target.closest("[data-alert-id]");
  if (!card) {
    return;
  }
  event.preventDefault();
  openModal(card.dataset.alertId);
});

mapRoot.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomMap(event.clientX, event.clientY, state.mapView.scale * delta);
  },
  { passive: false },
);

mapRoot.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  state.mapView.pointerId = event.pointerId;
  state.mapView.pointerAlertId = getAlertIdFromTarget(event.target);
  state.mapView.panStartX = event.clientX;
  state.mapView.panStartY = event.clientY;
  state.mapView.originTranslateX = state.mapView.translateX;
  state.mapView.originTranslateY = state.mapView.translateY;
  state.mapView.dragMoved = false;
  mapRoot.classList.add("isPanning");
  mapRoot.setPointerCapture(event.pointerId);
});

mapRoot.addEventListener("pointermove", (event) => {
  if (state.mapView.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - state.mapView.panStartX;
  const dy = event.clientY - state.mapView.panStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    state.mapView.dragMoved = true;
  }

  if (!state.mapView.dragMoved || state.mapView.scale <= 1) {
    return;
  }

  state.mapView.translateX = state.mapView.originTranslateX + dx;
  state.mapView.translateY = state.mapView.originTranslateY + dy;
  applyMapTransform();
});

function stopMapPan(event) {
  if (state.mapView.pointerId !== event.pointerId) {
    return;
  }

  if (mapRoot.hasPointerCapture(event.pointerId)) {
    mapRoot.releasePointerCapture(event.pointerId);
  }
  state.mapView.pointerId = null;
  mapRoot.classList.remove("isPanning");
}

mapRoot.addEventListener("pointerup", (event) => {
  const shouldOpenModal =
    !state.mapView.dragMoved && Boolean(state.mapView.pointerAlertId);
  const alertId = state.mapView.pointerAlertId;
  stopMapPan(event);
  state.mapView.dragMoved = false;
  state.mapView.pointerAlertId = null;

  if (shouldOpenModal && alertId) {
    openModal(alertId);
  }
});
mapRoot.addEventListener("pointercancel", stopMapPan);

mapRoot.addEventListener("dblclick", () => {
  resetMapView();
});

modalOverlay.addEventListener("click", (event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

modalClose.addEventListener("click", closeModal);

modalViewToggle.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) {
    return;
  }
  state.modalView = button.dataset.view;
  renderModal();
});

modalImageContainer.addEventListener(
  "wheel",
  (event) => {
    if (modalOverlay.hidden) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomModalImage(event.clientX, event.clientY, state.modalImageView.scale * delta);
  },
  { passive: false },
);

modalImageContainer.addEventListener("pointerdown", (event) => {
  if (modalOverlay.hidden || event.button !== 0) {
    return;
  }

  event.preventDefault();
  state.modalImageView.pointerId = event.pointerId;
  state.modalImageView.panStartX = event.clientX;
  state.modalImageView.panStartY = event.clientY;
  state.modalImageView.originTranslateX = state.modalImageView.translateX;
  state.modalImageView.originTranslateY = state.modalImageView.translateY;
  state.modalImageView.dragMoved = false;
  modalImageContainer.classList.add("isPanning");
  modalImageContainer.setPointerCapture(event.pointerId);
});

modalImageContainer.addEventListener("pointermove", (event) => {
  if (state.modalImageView.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - state.modalImageView.panStartX;
  const dy = event.clientY - state.modalImageView.panStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    state.modalImageView.dragMoved = true;
  }

  if (!state.modalImageView.dragMoved) {
    return;
  }

  state.modalImageView.translateX = state.modalImageView.originTranslateX + dx;
  state.modalImageView.translateY = state.modalImageView.originTranslateY + dy;
  applyModalTransform();
});

function stopModalPan(event) {
  if (state.modalImageView.pointerId !== event.pointerId) {
    return;
  }

  if (modalImageContainer.hasPointerCapture(event.pointerId)) {
    modalImageContainer.releasePointerCapture(event.pointerId);
  }
  state.modalImageView.pointerId = null;
  modalImageContainer.classList.remove("isPanning");
}

modalImageContainer.addEventListener("pointerup", stopModalPan);
modalImageContainer.addEventListener("pointercancel", stopModalPan);

modalImageContainer.addEventListener("dblclick", (event) => {
  event.preventDefault();
  resetModalZoom();
});

modalAlertMap.addEventListener(
  "wheel",
  (event) => {
    if (modalOverlay.hidden) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomModalMap(event.clientX, event.clientY, state.modalMapView.scale * delta);
  },
  { passive: false },
);

modalAlertMap.addEventListener("pointerdown", (event) => {
  if (modalOverlay.hidden || event.button !== 0) {
    return;
  }
  event.preventDefault();
  state.modalMapView.pointerId = event.pointerId;
  state.modalMapView.panStartX = event.clientX;
  state.modalMapView.panStartY = event.clientY;
  state.modalMapView.originTranslateX = state.modalMapView.translateX;
  state.modalMapView.originTranslateY = state.modalMapView.translateY;
  state.modalMapView.dragMoved = false;
  modalAlertMap.classList.add("isPanning");
  modalAlertMap.setPointerCapture(event.pointerId);
});

modalAlertMap.addEventListener("pointermove", (event) => {
  if (state.modalMapView.pointerId !== event.pointerId) {
    return;
  }
  const dx = event.clientX - state.modalMapView.panStartX;
  const dy = event.clientY - state.modalMapView.panStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    state.modalMapView.dragMoved = true;
  }
  if (!state.modalMapView.dragMoved || state.modalMapView.scale <= 1) {
    return;
  }
  state.modalMapView.translateX = state.modalMapView.originTranslateX + dx;
  state.modalMapView.translateY = state.modalMapView.originTranslateY + dy;
  applyModalMapTransform();
});

modalAlertMap.addEventListener("pointerup", stopModalMapPan);
modalAlertMap.addEventListener("pointercancel", stopModalMapPan);

modalAlertMap.addEventListener("dblclick", (event) => {
  event.preventDefault();
  resetModalMapView();
});

modalImage.addEventListener("load", updateModalLayout);
modalImage.addEventListener("error", () => {
  const alert = getAlertById(state.modalAlertId);
  if (!alert) {
    return;
  }

  const fallbackView = getAvailableViews(alert).find(
    (view) => view !== state.modalView,
  );
  if (fallbackView) {
    state.modalView = fallbackView;
    renderModal();
    return;
  }

  modalEmpty.hidden = false;
  modalZoomWrapper.hidden = true;
  modalBoundingBox.hidden = true;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modalAlertId) {
    closeModal();
  }
});

window.addEventListener("pointerdown", unlockAlertAudio, { passive: true });
window.addEventListener("keydown", unlockAlertAudio);

window.addEventListener("resize", () => {
  renderMap();
  renderModalAlertMap(getAlertById(state.modalAlertId));
  updateModalLayout();
});

function advanceHistoryTimeline() {
  if (state.timelineMode !== "history" || state.timelineDragging) {
    return;
  }
  const maxTimelineSecond = getMaxTimelineSecond(state.timelineDate);
  if (state.timelineSecond >= maxTimelineSecond) {
    updateTimelineControls();
    return;
  }
  state.timelineSecond += 1;
  updateTimelineControls();
  scheduleTimelineLoad();
}

window.setInterval(() => {
  if (!state.snapshot) {
    return;
  }
  advanceHistoryTimeline();
  if (!state.timelineDragging) {
    updateTimelineControls();
  }
  updateStatus(state.snapshot);
  renderMap();
}, 1000);

bootstrap().finally(connectSocket);
