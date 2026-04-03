const videoEl = document.getElementById("video");
const outputCanvas = document.getElementById("outputCanvas");
const fxCanvas = document.getElementById("fxCanvas");
const tipEl = document.getElementById("gestureTip");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");

const outputCtx = outputCanvas.getContext("2d");
const fxCtx = fxCanvas.getContext("2d");

fxCtx.imageSmoothingEnabled = true;

const DEBUG_METRICS =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).get("debug") === "1" ||
    window.localStorage?.getItem("shadowPlaygroundDebug") === "1");

const HYSTERESIS_MS = 220;
const IDEAL_WIDTH = 1280;
const IDEAL_HEIGHT = 720;
const IDEAL_FPS = 30;

let width = 1280;
let height = 720;
let camera = null;
let lastFrameTime = performance.now();
let lastResultAt = performance.now();
let prevResultIntervalMs = 1000 / 30;

let smoothedLightSpots = [];
let smoothedLightShadows = [];
let smoothedHandSizes = [];
let smoothedHands = [];

let prevSlotWristsPx = [];
let euroFiltersBySlot = [];

let lastValidHandsNormalized = null;
let lastValidTime = 0;

let smoothedWallCenterX = null;
let smoothedWallCenterY = null;
let smoothedWallRadius = null;

const metrics = {
  frames: 0,
  detectionFrames: 0,
  lastLogAt: 0,
  rollingFps: 0,
  rollingDetectionRate: 0,
};

class OneEuroFilter1D {
  constructor(minCutoff = 1.0, beta = 0.007, dcutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xPrev = null;
    this.dxPrev = 0;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }

  smoothingFactor(cutoffHz, dt) {
    const r = 2 * Math.PI * cutoffHz * dt;
    return r / (r + 1);
  }

  filter(x, dt) {
    if (this.xPrev == null || dt <= 0) {
      this.xPrev = x;
      return x;
    }
    const dx = (x - this.xPrev) / dt;
    const ad = this.smoothingFactor(this.dcutoff, dt);
    const dxHat = ad * dx + (1 - ad) * this.dxPrev;
    this.dxPrev = dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.smoothingFactor(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}

const EURO_MIN_CUTOFF = 0.55;
const EURO_BETA = 0.005;
const EURO_D_CUTOFF = 0.85;
const EURO_Z_SCALE = 0.65;

function createEuroFiltersForHand() {
  const filters = [];
  for (let i = 0; i < 21; i++) {
    filters[i] = {
      x: new OneEuroFilter1D(EURO_MIN_CUTOFF, EURO_BETA, EURO_D_CUTOFF),
      y: new OneEuroFilter1D(EURO_MIN_CUTOFF, EURO_BETA, EURO_D_CUTOFF),
      z: new OneEuroFilter1D(EURO_MIN_CUTOFF * EURO_Z_SCALE, EURO_BETA, EURO_D_CUTOFF),
    };
  }
  return filters;
}

function resetEuroFiltersForSlot(slotIdx) {
  euroFiltersBySlot[slotIdx] = createEuroFiltersForHand();
}

function ensureEuroSlotCount(count) {
  while (euroFiltersBySlot.length < count) {
    euroFiltersBySlot.push(createEuroFiltersForHand());
  }
  if (euroFiltersBySlot.length > count) {
    euroFiltersBySlot.length = count;
  }
}

function getMediaPipeHandsOptions() {
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const hq = params?.get("hq") === "1";
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  const modelComplexity = hq && cores >= 4 ? 2 : 1;
  return {
    maxNumHands: 4,
    modelComplexity,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.68,
  };
}

function wristPxFromLandmarks(handLm) {
  const w = handLm[0];
  return { x: (1 - w.x) * width, y: w.y * height };
}

function matchHandsToSlots(currentHandsLm) {
  const m = currentHandsLm.length;
  if (m === 0) return [];

  if (prevSlotWristsPx.length === 0 || prevSlotWristsPx.length !== m) {
    return currentHandsLm.map((h, i) => i);
  }

  const pairs = [];
  for (let slot = 0; slot < m; slot++) {
    for (let cur = 0; cur < m; cur++) {
      const w = wristPxFromLandmarks(currentHandsLm[cur]);
      const p = prevSlotWristsPx[slot];
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      pairs.push({ slot, cur, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const assignedSlot = new Set();
  const assignedCur = new Set();
  const slotToCur = new Array(m).fill(-1);

  for (const { slot, cur } of pairs) {
    if (assignedSlot.has(slot) || assignedCur.has(cur)) continue;
    assignedSlot.add(slot);
    assignedCur.add(cur);
    slotToCur[slot] = cur;
  }

  for (let slot = 0; slot < m; slot++) {
    if (slotToCur[slot] === -1) {
      for (let cur = 0; cur < m; cur++) {
        if (!assignedCur.has(cur)) {
          slotToCur[slot] = cur;
          assignedCur.add(cur);
          break;
        }
      }
    }
  }

  return slotToCur;
}

function orderHandsForSlots(currentHandsLm, permutation) {
  return permutation.map((curIdx) => currentHandsLm[curIdx]);
}

function resizeCanvases() {
  const rect = outputCanvas.getBoundingClientRect();
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));

  [outputCanvas, fxCanvas].forEach((canvas) => {
    canvas.width = width;
    canvas.height = height;
  });
}

window.addEventListener("resize", resizeCanvases);

function toPx(lm) {
  return {
    x: (1 - lm.x) * width,
    y: lm.y * height,
    z: lm.z || 0,
  };
}

function drawWallBackground(lightX = width * 0.5, lightY = height * 0.44, radius = 320) {
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.fillStyle = "#000";
  outputCtx.fillRect(0, 0, width, height);

  const wall = outputCtx.createRadialGradient(lightX, lightY, 30, lightX, lightY, radius);
  wall.addColorStop(0, "rgba(236, 206, 150, 0.78)");
  wall.addColorStop(0.45, "rgba(188, 139, 82, 0.62)");
  wall.addColorStop(0.8, "rgba(45, 31, 18, 0.25)");
  wall.addColorStop(1, "rgba(0, 0, 0, 0)");
  outputCtx.fillStyle = wall;
  outputCtx.fillRect(0, 0, width, height);

  outputCtx.fillStyle = "rgba(16, 10, 6, 0.28)";
  for (let i = 0; i < 22; i++) {
    const x = (i / 22) * width;
    outputCtx.fillRect(x, 0, 1, height);
  }
}

function getHandSizeFromPoints(pts) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return Math.max(maxX - minX, maxY - minY);
}

function shadowStretchK(z) {
  const t = Math.max(0, -(z ?? 0));
  const k = 0.52 + t * 0.72;
  return Math.min(0.82, Math.max(0.4, k));
}

function projectPoint(p, light, k) {
  return {
    x: p.x + (p.x - light.x) * k,
    y: p.y + (p.y - light.y) * k,
    z: p.z,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothPoint(prev, next, t) {
  if (!prev) return { ...next };
  return {
    x: lerp(prev.x, next.x, t),
    y: lerp(prev.y, next.y, t),
    z: lerp(prev.z ?? 0, next.z ?? 0, t),
  };
}

function smoothScalar(prev, next, t) {
  if (prev == null || Number.isNaN(prev)) return next;
  return lerp(prev, next, t);
}

function dtToLerpAlpha(baseAlpha, dtSec) {
  const ref = 1 / 60;
  const k = 1 - Math.pow(1 - baseAlpha, dtSec / ref);
  return Math.min(1, Math.max(0, k));
}

function getLightTargetsForHand(points, handSize) {
  const wrist = points[0];
  const palm = points[9];
  const dx = palm.x - wrist.x;
  const dy = palm.y - wrist.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const fingerPush = handSize * 0.2;
  const targetSpot = {
    x: palm.x + nx * fingerPush,
    y: palm.y + ny * fingerPush,
  };
  const along = 0.36;
  const targetShadow = {
    x: wrist.x + dx * along,
    y: wrist.y + dy * along,
  };
  return { targetSpot, targetShadow };
}

function convexHull(points) {
  if (points.length <= 3) return points.slice();
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function drawFingerShadow(points, indices, widthPx, light) {
  fxCtx.beginPath();
  const startRaw = points[indices[0]];
  const start = projectPoint(startRaw, light, shadowStretchK(startRaw.z));
  fxCtx.moveTo(start.x, start.y);
  for (let i = 1; i < indices.length; i++) {
    const raw = points[indices[i]];
    const p = projectPoint(raw, light, shadowStretchK(raw.z));
    fxCtx.lineTo(p.x, p.y);
  }
  fxCtx.lineCap = "round";
  fxCtx.lineJoin = "round";
  fxCtx.lineWidth = widthPx;
  fxCtx.stroke();
}

function drawPalmSilhouette(points, light, edgeWidth) {
  const palmAnchors = [0, 1, 2, 5, 9, 13, 17].map((idx) => {
    const raw = points[idx];
    return projectPoint(raw, light, shadowStretchK(raw.z));
  });
  const hull = convexHull(palmAnchors);
  if (hull.length < 3) return;
  fxCtx.beginPath();
  fxCtx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) fxCtx.lineTo(hull[i].x, hull[i].y);
  fxCtx.closePath();
  fxCtx.fill();
  if (edgeWidth > 0) {
    fxCtx.lineWidth = edgeWidth;
    fxCtx.stroke();
  }
}

function applyOneEuroToAllLandmarks(rawPoints, handIdx, dtSec, pointsOut) {
  const filters = euroFiltersBySlot[handIdx];
  for (let i = 0; i < 21; i++) {
    const f = filters[i];
    pointsOut[i] = {
      x: f.x.filter(rawPoints[i].x, dtSec),
      y: f.y.filter(rawPoints[i].y, dtSec),
      z: f.z.filter(rawPoints[i].z ?? 0, dtSec),
    };
  }
}

function drawShadowStage(handLandmarks, dtSec, options = {}) {
  const { freezeSmoothing = false } = options;
  fxCtx.clearRect(0, 0, width, height);
  fxCtx.fillStyle = "rgba(0, 0, 0, 0.96)";
  fxCtx.fillRect(0, 0, width, height);

  const hands = Array.isArray(handLandmarks[0]) ? handLandmarks : [handLandmarks];

  if (!smoothedHands || smoothedHands.length !== hands.length) {
    smoothedHands = hands.map((hand) => hand.map(toPx));
    hands.forEach((_, i) => resetEuroFiltersForSlot(i));
  }
  if (!smoothedLightSpots || smoothedLightSpots.length !== hands.length) {
    const prev = smoothedLightSpots || [];
    smoothedLightSpots = hands.map((_, i) => (i < prev.length ? prev[i] : null));
  }
  if (!smoothedLightShadows || smoothedLightShadows.length !== hands.length) {
    const prev = smoothedLightShadows || [];
    smoothedLightShadows = hands.map((_, i) => (i < prev.length ? prev[i] : null));
  }
  if (!smoothedHandSizes || smoothedHandSizes.length !== hands.length) {
    const prev = smoothedHandSizes || [];
    smoothedHandSizes = hands.map((_, i) => (i < prev.length ? prev[i] : null));
  }

  ensureEuroSlotCount(hands.length);

  const lightAlpha = dtToLerpAlpha(0.055, dtSec);
  const shadowAlpha = dtToLerpAlpha(0.058, dtSec);
  const sizeAlpha = dtToLerpAlpha(0.09, dtSec);

  for (let handIdx = 0; handIdx < hands.length; handIdx++) {
    const hand = hands[handIdx];
    const rawPoints = hand.map(toPx);
    let points;
    if (freezeSmoothing) {
      points = smoothedHands[handIdx];
    } else {
      points = rawPoints.map((p) => ({ ...p }));
      applyOneEuroToAllLandmarks(rawPoints, handIdx, dtSec, points);
      for (let i = 0; i < 21; i++) {
        smoothedHands[handIdx][i] = points[i];
      }
    }

    let handSize;
    let lightSpot;
    let lightShadow;

    if (freezeSmoothing) {
      handSize = smoothedHandSizes[handIdx];
      lightSpot = smoothedLightSpots[handIdx];
      lightShadow = smoothedLightShadows[handIdx];
    } else {
      const handSizeRaw = getHandSizeFromPoints(points);
      smoothedHandSizes[handIdx] = smoothScalar(smoothedHandSizes[handIdx], handSizeRaw, sizeAlpha);
      handSize = smoothedHandSizes[handIdx];

      const { targetSpot, targetShadow } = getLightTargetsForHand(points, handSize);
      smoothedLightSpots[handIdx] = smoothPoint(smoothedLightSpots[handIdx], targetSpot, lightAlpha);
      smoothedLightShadows[handIdx] = smoothPoint(
        smoothedLightShadows[handIdx],
        targetShadow,
        shadowAlpha
      );
      lightSpot = smoothedLightSpots[handIdx];
      lightShadow = smoothedLightShadows[handIdx];
    }

    const spotlightRadius = Math.max(170, Math.min(420, handSize * 1.55));
    const spotlight = fxCtx.createRadialGradient(
      lightSpot.x,
      lightSpot.y,
      48,
      lightSpot.x,
      lightSpot.y,
      spotlightRadius
    );
    spotlight.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    spotlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    fxCtx.globalCompositeOperation = "destination-out";
    fxCtx.fillStyle = spotlight;
    fxCtx.fillRect(0, 0, width, height);
    fxCtx.globalCompositeOperation = "source-over";

    fxCtx.fillStyle = "#050505";
    fxCtx.strokeStyle = "#050505";
    fxCtx.shadowBlur = Math.max(2, Math.min(8, handSize * 0.03));
    fxCtx.shadowColor = "rgba(0, 0, 0, 0.45)";

    const fingerBase = Math.max(24, Math.min(60, handSize * 0.21));
    drawPalmSilhouette(points, lightShadow, fingerBase * 0.9);
    drawFingerShadow(points, [2, 3, 4], fingerBase * 0.76, lightShadow);
    drawFingerShadow(points, [5, 6, 7, 8], fingerBase * 0.96, lightShadow);
    drawFingerShadow(points, [9, 10, 11, 12], fingerBase * 0.98, lightShadow);
    drawFingerShadow(points, [13, 14, 15, 16], fingerBase * 0.9, lightShadow);
    drawFingerShadow(points, [17, 18, 19, 20], fingerBase * 0.8, lightShadow);
    fxCtx.shadowBlur = 0;
  }

  if (!freezeSmoothing && hands.length > 0) {
    prevSlotWristsPx = smoothedHands.map((h) => ({ x: h[0].x, y: h[0].y }));
  }
}

function getHandsLightingInfo(hands) {
  let sumX = 0;
  let sumY = 0;
  let maxHandSize = 0;

  for (const hand of hands) {
    const points = hand.map(toPx);
    const palm = points[9];
    sumX += palm.x;
    sumY += palm.y;
    maxHandSize = Math.max(maxHandSize, getHandSizeFromPoints(points));
  }

  const centerX = sumX / hands.length;
  const centerY = sumY / hands.length;

  let maxPalmDistance = 0;
  for (const hand of hands) {
    const palm = toPx(hand[9]);
    const d = Math.hypot(palm.x - centerX, palm.y - centerY);
    maxPalmDistance = Math.max(maxPalmDistance, d);
  }

  const radius = Math.max(300, Math.min(780, maxHandSize * 2.1 + maxPalmDistance * 1.15));
  return { centerX, centerY, radius };
}

function getSmoothedWallLighting(hands, dtSec) {
  const raw = getHandsLightingInfo(hands);
  const aPos = dtToLerpAlpha(0.052, dtSec);
  const aRad = dtToLerpAlpha(0.032, dtSec);

  if (smoothedWallCenterX == null || smoothedWallCenterY == null || smoothedWallRadius == null) {
    smoothedWallCenterX = raw.centerX;
    smoothedWallCenterY = raw.centerY;
    smoothedWallRadius = raw.radius;
  } else {
    smoothedWallCenterX = lerp(smoothedWallCenterX, raw.centerX, aPos);
    smoothedWallCenterY = lerp(smoothedWallCenterY, raw.centerY, aPos);
    smoothedWallRadius = lerp(smoothedWallRadius, raw.radius, aRad);
    smoothedWallRadius = Math.max(300, Math.min(780, smoothedWallRadius));
  }

  return { centerX: smoothedWallCenterX, centerY: smoothedWallCenterY, radius: smoothedWallRadius };
}

function resetWallLightingSmoothing() {
  smoothedWallCenterX = null;
  smoothedWallCenterY = null;
  smoothedWallRadius = null;
}

function clearTrackingState() {
  smoothedHands = [];
  smoothedLightSpots = [];
  smoothedLightShadows = [];
  smoothedHandSizes = [];
  prevSlotWristsPx = [];
  euroFiltersBySlot = [];
  lastValidHandsNormalized = null;
  resetWallLightingSmoothing();
}

function tryApplyVideoConstraints() {
  const track = videoEl.srcObject?.getVideoTracks?.()?.[0];
  if (!track?.applyConstraints) return;
  track.applyConstraints({ frameRate: { ideal: IDEAL_FPS, max: 60 } }).catch(() => {});
}

function logMetrics(now, hadDetection, dtMs) {
  if (!DEBUG_METRICS) return;
  metrics.frames += 1;
  if (hadDetection) metrics.detectionFrames += 1;
  if (metrics.lastLogAt === 0) metrics.lastLogAt = now;
  if (now - metrics.lastLogAt < 2000) return;
  const elapsed = now - metrics.lastLogAt;
  const fps = (metrics.frames / elapsed) * 1000;
  const detRate = metrics.detectionFrames / Math.max(1, metrics.frames);
  metrics.rollingFps = fps;
  metrics.rollingDetectionRate = detRate;
  console.info(
    "[ShadowPlayGround]",
    `fps≈${fps.toFixed(1)}`,
    `detectionRatio=${detRate.toFixed(2)}`,
    `onResultsΔ≈${dtMs.toFixed(1)}ms`,
    `modelComplexity=${getMediaPipeHandsOptions().modelComplexity}`
  );
  metrics.frames = 0;
  metrics.detectionFrames = 0;
  metrics.lastLogAt = now;
}

function openSidebar() {
  sidebar.classList.remove("hidden");
  sidebarBackdrop.classList.remove("hidden");
}

function closeSidebar() {
  sidebar.classList.add("hidden");
  sidebarBackdrop.classList.add("hidden");
}

async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent = "초기화 중...";

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions(getMediaPipeHandsOptions());

  hands.onResults((results) => {
    try {
      const now = performance.now();
      const dtMs = now - lastResultAt;
      prevResultIntervalMs = dtMs > 0 ? dtMs : prevResultIntervalMs;
      const dtSec = Math.min(0.08, Math.max(1 / 240, dtMs / 1000));
      lastResultAt = now;
      lastFrameTime = now;

      const hasHands = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
      let handsForDraw = null;
      let freezeSmoothing = false;

      if (hasHands) {
        const perm = matchHandsToSlots(results.multiHandLandmarks);
        handsForDraw = orderHandsForSlots(results.multiHandLandmarks, perm);
        lastValidHandsNormalized = handsForDraw;
        lastValidTime = now;
      } else if (lastValidHandsNormalized && now - lastValidTime < HYSTERESIS_MS) {
        handsForDraw = lastValidHandsNormalized;
        freezeSmoothing = true;
      }

      logMetrics(now, hasHands, prevResultIntervalMs);

      if (handsForDraw && handsForDraw.length > 0) {
        const lightInfo = getSmoothedWallLighting(handsForDraw, dtSec);
        drawWallBackground(lightInfo.centerX, lightInfo.centerY, lightInfo.radius);
        drawShadowStage(handsForDraw, dtSec, { freezeSmoothing });
      } else {
        drawWallBackground();
        fxCtx.clearRect(0, 0, width, height);
        fxCtx.fillStyle = "rgba(0, 0, 0, 0.96)";
        fxCtx.fillRect(0, 0, width, height);
        clearTrackingState();
      }
    } catch (err) {
      console.error("[ShadowPlayGround] onResults:", err);
    }
  });

  camera = new Camera(videoEl, {
    onFrame: async () => {
      await hands.send({ image: videoEl });
    },
    width: IDEAL_WIDTH,
    height: IDEAL_HEIGHT,
    facingMode: "user",
  });

  await camera.start();
  tryApplyVideoConstraints();
  resizeCanvases();
  lastResultAt = performance.now();
  lastFrameTime = lastResultAt;
  drawWallBackground();

  startBtn.textContent = "실행 중";
  tipEl.textContent = "실행 중";
  startOverlay.classList.add("hidden");
}

startBtn.addEventListener("click", () => {
  startCamera().catch((err) => {
    console.error(err);
    startBtn.disabled = false;
    startBtn.textContent = "다시 시작";
    tipEl.textContent = "카메라 접근 권한을 허용한 뒤 다시 시도해 주세요.";
    startOverlay.classList.remove("hidden");
  });
});

menuBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});
