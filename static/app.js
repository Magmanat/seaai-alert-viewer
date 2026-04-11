const state = {
  snapshot: null,
  lastAlertsSignature: "",
  modalAlertId: null,
  modalView: null,
};

const mapRoot = document.getElementById("map-root");
const mapSvg = document.getElementById("map-svg");
const mapOverlay = document.getElementById("map-overlay");
const mapEmpty = document.getElementById("map-empty");
const alertsList = document.getElementById("alerts-list");
const alertsEmpty = document.getElementById("alerts-empty");
const alertCount = document.getElementById("alert-count");
const trackCount = document.getElementById("track-count");
const statusPill = document.getElementById("status-pill");
const statusLabel = document.getElementById("status-label");
const lastMessage = document.getElementById("last-message");

const modalOverlay = document.getElementById("alert-modal");
const modalClose = document.getElementById("modal-close");
const modalViewToggle = document.getElementById("modal-view-toggle");
const modalImageContainer = document.getElementById("modal-image-container");
const modalZoomWrapper = document.getElementById("modal-zoom-wrapper");
const modalImage = document.getElementById("modal-image");
const modalBoundingBox = document.getElementById("modal-bounding-box");
const modalEmpty = document.getElementById("modal-empty");

const SVG_NS = "http://www.w3.org/2000/svg";

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

function renderAlerts() {
  const alerts = state.snapshot?.alerts || [];
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
    alertCount.textContent = String(alerts.length);
    alertsEmpty.style.display = alerts.length ? "none" : "flex";
    return;
  }

  state.lastAlertsSignature = signature;
  alertCount.textContent = String(alerts.length);
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

function renderMap() {
  const snapshot = state.snapshot;
  const tracks = snapshot?.tracks || [];
  const maxDistanceM = snapshot?.map?.maxDistanceM || 1000;
  const trackWindowMs = snapshot?.map?.trackWindowMs || 60000;
  const geometry = getGeometry(mapRoot, maxDistanceM);

  trackCount.textContent = String(tracks.length);
  mapEmpty.style.display = tracks.length ? "none" : "block";
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
      const opacity = Math.max(0, Math.min(1, 1 - ageMs / trackWindowMs));
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
      polyline.setAttribute("fill", "none");

      mappedPoints.slice(0, -1).forEach((point) => {
        appendSvgElement("circle", {
          cx: point.x.toFixed(2),
          cy: point.y.toFixed(2),
          r: 3,
          class: "trackDot",
          opacity: opacity.toFixed(2),
        });
      });

      const current = mappedPoints[mappedPoints.length - 1];
      const marker = document.createElement("div");
      marker.className = "trackedObjectMarker";
      marker.style.left = `${current.x}px`;
      marker.style.top = `${current.y}px`;
      marker.style.opacity = opacity.toFixed(2);
      marker.title = `${track.typeLabel} #${track.trackId} | ${track.bearing} | ${track.confidence}%`;
      marker.innerHTML = `
        <div class="trackedObjectContent">
          <div class="labeledPinWrapper">
            <div class="markerIconInLabel">
              <img src="/static/assets/${escapeHtml(track.type)}.svg" class="trackedObjectIcon" alt="${escapeHtml(track.typeLabel)}" />
            </div>
            <span class="labeledPinDistance">${Math.round(track.positions[track.positions.length - 1].distance)}m</span>
          </div>
        </div>
      `;
      mapOverlay.appendChild(marker);
    });
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
    const fitScale = Math.min(
      containerWidth / naturalWidth,
      containerHeight / naturalHeight,
    );

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

  modalZoomWrapper.style.width = `${naturalWidth}px`;
  modalZoomWrapper.style.height = `${naturalHeight}px`;
  modalZoomWrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  applyBoundingBoxStrokeScale(scale);
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
  modalOverlay.hidden = false;
  modalOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modalOpen");
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
  modalOverlay.hidden = true;
  modalOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modalOpen");
}

function renderAll() {
  if (!state.snapshot) {
    return;
  }
  updateStatus(state.snapshot);
  renderAlerts();
  renderMap();
  renderModal();
}

async function bootstrap() {
  const response = await fetch("/api/state");
  state.snapshot = await response.json();
  renderAll();
}

function connectSocket() {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${window.location.host}/ws/ui`);

  socket.addEventListener("message", (event) => {
    state.snapshot = JSON.parse(event.data);
    renderAll();
  });

  socket.addEventListener("close", () => {
    window.setTimeout(connectSocket, 1500);
  });
}

alertsList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-alert-id]");
  if (!card) {
    return;
  }
  openModal(card.dataset.alertId);
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

window.addEventListener("resize", () => {
  renderMap();
  updateModalLayout();
});

window.setInterval(() => {
  if (!state.snapshot) {
    return;
  }
  updateStatus(state.snapshot);
  renderMap();
}, 1000);

bootstrap().finally(connectSocket);
