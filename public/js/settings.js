const LS_PERF = "shadowPlaygroundPerf";
const LS_SOUND = "shadowPlaygroundSound";

function readBool(key, defaultVal) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultVal;
    return v === "1" || v === "true";
  } catch {
    return defaultVal;
  }
}

function writeBool(key, val) {
  try {
    localStorage.setItem(key, val ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let performanceMode = readBool(LS_PERF, false);
let soundEnabled = readBool(LS_SOUND, true);

const mqReduce =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

let reducedMotionUser = mqReduce?.matches ?? false;

if (mqReduce) {
  mqReduce.addEventListener("change", (e) => {
    reducedMotionUser = e.matches;
  });
}

export function isPerformanceMode() {
  return performanceMode;
}

export function setPerformanceMode(on) {
  performanceMode = Boolean(on);
  writeBool(LS_PERF, performanceMode);
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(on) {
  soundEnabled = Boolean(on);
  writeBool(LS_SOUND, soundEnabled);
}

/** Strong motion reduction (OS or effective). */
export function isReducedMotion() {
  return reducedMotionUser || performanceMode;
}

/** 1 = full particles, ~0.45 perf, 0 if reduced motion */
export function getParticleIntensity() {
  if (reducedMotionUser) return 0.08;
  if (performanceMode) return 0.42;
  return 1;
}

/** Max canvas long edge in CSS pixels for internal bitmap. */
export function getCanvasLongEdgeCap() {
  if (performanceMode) return 960;
  return 1280;
}

export function getShadowBlurScale() {
  if (performanceMode) return 0.55;
  if (reducedMotionUser) return 0.72;
  return 1;
}
