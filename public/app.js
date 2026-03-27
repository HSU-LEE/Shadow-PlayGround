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

let width = 1280;
let height = 720;
let camera = null;
let lastFrameTime = performance.now();
let smoothedLightSpots = [];
let smoothedLightShadows = [];
let smoothedHandSizes = [];
let smoothedHands = [];

const POINT_SMOOTHING = 0.13;
const LIGHT_SPOT_SMOOTHING = 0.1;
const LIGHT_SHADOW_SMOOTHING = 0.105;
const HAND_SIZE_SMOOTHING = 0.14;

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
  wall.addColorStop(0, "rgba(246, 214, 160, 0.92)");
  wall.addColorStop(0.45, "rgba(188, 139, 82, 0.7)");
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
  const start = projectPoint(startRaw, light, 0.55 + Math.max(0, -startRaw.z) * 1.25);
  fxCtx.moveTo(start.x, start.y);
  for (let i = 1; i < indices.length; i++) {
    const raw = points[indices[i]];
    const p = projectPoint(raw, light, 0.55 + Math.max(0, -raw.z) * 1.25);
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
    return projectPoint(raw, light, 0.55 + Math.max(0, -raw.z) * 1.25);
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

function drawShadowStage(handLandmarks) {
  fxCtx.clearRect(0, 0, width, height);
  fxCtx.fillStyle = "rgba(0, 0, 0, 0.96)";
  fxCtx.fillRect(0, 0, width, height);

  const hands = Array.isArray(handLandmarks[0]) ? handLandmarks : [handLandmarks];

  if (!smoothedHands || smoothedHands.length !== hands.length) {
    smoothedHands = hands.map((hand) => hand.map(toPx));
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

  for (let handIdx = 0; handIdx < hands.length; handIdx++) {
    const hand = hands[handIdx];
    const rawPoints = hand.map(toPx);
    const points = rawPoints.map((pt, i) => {
      const prev = smoothedHands[handIdx][i];
      const next = smoothPoint(prev, pt, POINT_SMOOTHING);
      smoothedHands[handIdx][i] = next;
      return next;
    });
    const handSizeRaw = getHandSizeFromPoints(points);
    smoothedHandSizes[handIdx] = smoothScalar(smoothedHandSizes[handIdx], handSizeRaw, HAND_SIZE_SMOOTHING);
    const handSize = smoothedHandSizes[handIdx];

    const { targetSpot, targetShadow } = getLightTargetsForHand(points, handSize);
    smoothedLightSpots[handIdx] = smoothPoint(smoothedLightSpots[handIdx], targetSpot, LIGHT_SPOT_SMOOTHING);
    smoothedLightShadows[handIdx] = smoothPoint(
      smoothedLightShadows[handIdx],
      targetShadow,
      LIGHT_SHADOW_SMOOTHING
    );
    const lightSpot = smoothedLightSpots[handIdx];
    const lightShadow = smoothedLightShadows[handIdx];

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

  hands.setOptions({
    maxNumHands: 4,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.78,
  });

  hands.onResults((results) => {
    const now = performance.now();
    lastFrameTime = now;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const handsDetected = results.multiHandLandmarks;
      const lightInfo = getHandsLightingInfo(handsDetected);
      drawWallBackground(lightInfo.centerX, lightInfo.centerY, lightInfo.radius);
      drawShadowStage(handsDetected);
    } else {
      drawWallBackground();
      fxCtx.clearRect(0, 0, width, height);
      fxCtx.fillStyle = "rgba(0, 0, 0, 0.96)";
      fxCtx.fillRect(0, 0, width, height);
      smoothedHands = [];
      smoothedLightSpots = [];
      smoothedLightShadows = [];
      smoothedHandSizes = [];
    }
  });

  camera = new Camera(videoEl, {
    onFrame: async () => {
      await hands.send({ image: videoEl });
    },
    width: 1280,
    height: 720,
  });

  await camera.start();
  resizeCanvases();
  lastFrameTime = performance.now();
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
