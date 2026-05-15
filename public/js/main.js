import {
  bindStage,
  resizeCanvases,
  drawWallBackground,
  drawShadowStage,
  getSmoothedWallLighting,
  clearTrackingState,
  matchHandsToSlots,
  orderHandsForSlots,
  getWidth,
  getHeight,
} from "./render.js";
import { ShadowGame } from "./game.js";
import { getMediaPipeHandsOptions } from "./mediapipe-options.js";
import { classifyCameraError, messageForCameraCode } from "./camera-errors.js";
import {
  initI18n,
  applyDomI18n,
  t,
  setLang,
  getLang,
  onLangChange,
} from "./i18n.js";
import {
  isPerformanceMode,
  setPerformanceMode,
  isSoundEnabled,
  setSoundEnabled,
} from "./settings.js";

const videoEl = document.getElementById("video");
const outputCanvas = document.getElementById("outputCanvas");
const fxCanvas = document.getElementById("fxCanvas");
const tipEl = document.getElementById("gestureTip");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const startSpinner = document.getElementById("startSpinner");
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const spellNameEl = document.getElementById("spellName");
const particleCanvas = document.getElementById("particleCanvas");
const stageWrap = document.querySelector(".stage-wrap");
const modeFreeBtn = document.getElementById("modeFreeBtn");
const modeChallengeBtn = document.getElementById("modeChallengeBtn");
const modeLearnBtn = document.getElementById("modeLearnBtn");
const perfToggle = document.getElementById("perfToggle");
const soundToggle = document.getElementById("soundToggle");
const langSelect = document.getElementById("langSelect");
const hudCoach = document.getElementById("hudCoach");

const DEBUG_METRICS =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).get("debug") === "1" ||
    window.localStorage?.getItem("shadowPlaygroundDebug") === "1");

const HYSTERESIS_MS = 220;
const IDEAL_WIDTH = 1280;
const IDEAL_HEIGHT = 720;
const IDEAL_FPS = 30;

let camera = null;
let handsInstance = null;
let lastResultAt = performance.now();
let prevResultIntervalMs = 1000 / 30;
let lastValidHandsNormalized = null;
let lastValidTime = 0;

let latestFrame = null;
let rafScheduled = false;

let lastSpellAnnounced = "";
let lastSpellAnnounceAt = 0;
const SPELL_ANNOUNCE_MS = 420;

let coachOtherMs = 0;
let lastHudSpell = "";

const metrics = {
  frames: 0,
  detectionFrames: 0,
  lastLogAt: 0,
};

function logMetrics(now, hadDetection, dtMs) {
  if (!DEBUG_METRICS) return;
  metrics.frames += 1;
  if (hadDetection) metrics.detectionFrames += 1;
  if (metrics.lastLogAt === 0) metrics.lastLogAt = now;
  if (now - metrics.lastLogAt < 2000) return;
  const elapsed = now - metrics.lastLogAt;
  const fps = (metrics.frames / elapsed) * 1000;
  const detRate = metrics.detectionFrames / Math.max(1, metrics.frames);
  console.info(
    "[ShadowPlayGround]",
    `fps≈${fps.toFixed(1)}`,
    `detectionRatio=${detRate.toFixed(2)}`,
    `onResultsΔ≈${dtMs.toFixed(1)}ms`,
    `modelComplexity=${getMediaPipeHandsOptions({ performanceMode: isPerformanceMode() }).modelComplexity}`
  );
  metrics.frames = 0;
  metrics.detectionFrames = 0;
  metrics.lastLogAt = now;
}

function maybeAnnounceSpell(text, now) {
  if (!spellNameEl) return;
  if (text === lastSpellAnnounced && now - lastSpellAnnounceAt < SPELL_ANNOUNCE_MS) return;
  lastSpellAnnounced = text;
  lastSpellAnnounceAt = now;
  spellNameEl.textContent = text;
}

function drawFrameFromPending() {
  const f = latestFrame;
  if (!f) return;
  const { now, dtSec, handsForDraw, freezeSmoothing, hasHands, landmarksOne } = f;
  const width = getWidth();
  const height = getHeight();

  let tickGesture = "none";
  if (typeof ShadowGame !== "undefined" && ShadowGame.tick) {
    const tickResult = ShadowGame.tick({
      now,
      dtSec,
      handsLmArray: landmarksOne,
      hasHands,
      width,
      height,
    });
    tickGesture = tickResult?.gesture ?? "none";
  }

  const moodCombo = ShadowGame.getCombo ? ShadowGame.getCombo() : 0;

  const spellText = document.getElementById("hudSpell")?.textContent ?? "";
  if (spellText && spellText !== lastHudSpell) {
    lastHudSpell = spellText;
    maybeAnnounceSpell(spellText, now);
  }

  const mode = ShadowGame.getMode?.();
  if (hudCoach) {
    if ((mode === "challenge" || mode === "learn") && hasHands && landmarksOne?.length) {
      if (tickGesture === "other") coachOtherMs += dtSec * 1000;
      else coachOtherMs = Math.max(0, coachOtherMs - dtSec * 500);
      if (coachOtherMs > 900) {
        hudCoach.textContent = Math.random() < 0.5 ? t("coach.dim") : t("coach.oneHand");
      } else {
        hudCoach.textContent = "";
      }
    } else {
      coachOtherMs = 0;
      hudCoach.textContent = "";
    }
  }

  if (handsForDraw && handsForDraw.length > 0) {
    const lightInfo = getSmoothedWallLighting(handsForDraw, dtSec);
    drawWallBackground(lightInfo.centerX, lightInfo.centerY, lightInfo.radius, moodCombo);
    drawShadowStage(handsForDraw, dtSec, { freezeSmoothing });
  } else {
    drawWallBackground(undefined, undefined, undefined, moodCombo);
    fxDrawingCtx.clearRect(0, 0, width, height);
    fxDrawingCtx.fillStyle = "rgba(0, 0, 0, 0.96)";
    fxDrawingCtx.fillRect(0, 0, width, height);
    clearTrackingState();
    lastValidHandsNormalized = null;
  }
}

function requestDraw() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    drawFrameFromPending();
  });
}

function tryApplyVideoConstraints() {
  const track = videoEl.srcObject?.getVideoTracks?.()?.[0];
  if (!track?.applyConstraints) return;
  track.applyConstraints({ frameRate: { ideal: IDEAL_FPS, max: 60 } }).catch(() => {});
}

let sidebarReturnFocus = null;

function getFocusableInSidebar() {
  if (!sidebar) return [];
  const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  return [...sidebar.querySelectorAll(sel)].filter(
    (el) => el.offsetParent !== null && !el.hasAttribute("data-skip-trap")
  );
}

function openSidebar() {
  sidebarReturnFocus = document.activeElement;
  sidebar.classList.remove("hidden");
  sidebarBackdrop.classList.remove("hidden");
  sidebarBackdrop.setAttribute("aria-hidden", "false");
  const focusables = getFocusableInSidebar();
  (focusables[0] || closeSidebarBtn)?.focus?.();
}

function closeSidebar() {
  sidebar.classList.add("hidden");
  sidebarBackdrop.classList.add("hidden");
  sidebarBackdrop.setAttribute("aria-hidden", "true");
  if (sidebarReturnFocus && typeof sidebarReturnFocus.focus === "function") {
    sidebarReturnFocus.focus();
  } else {
    menuBtn?.focus?.();
  }
  sidebarReturnFocus = null;
}

function trapSidebarKeydown(event) {
  if (sidebar.classList.contains("hidden")) return;
  if (event.key !== "Tab") return;
  const focusables = getFocusableInSidebar();
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function syncModeButtons() {
  if (!modeFreeBtn || !modeChallengeBtn) return;
  const m = ShadowGame.getMode();
  modeFreeBtn.classList.toggle("mode-btn-active", m === "free");
  modeChallengeBtn.classList.toggle("mode-btn-active", m === "challenge");
  if (modeLearnBtn) modeLearnBtn.classList.toggle("mode-btn-active", m === "learn");
}

function syncSettingsUi() {
  if (perfToggle) perfToggle.checked = isPerformanceMode();
  if (soundToggle) soundToggle.checked = isSoundEnabled();
  if (langSelect) langSelect.value = getLang();
}

async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent = t("start.btnLoading");
  if (startSpinner) startSpinner.classList.remove("hidden");
  tipEl.textContent = t("start.btnLoading");

  try {
    handsInstance = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    handsInstance.setOptions(
      getMediaPipeHandsOptions({ performanceMode: isPerformanceMode() })
    );

    handsInstance.onResults((results) => {
      try {
        const now = performance.now();
        const dtMs = now - lastResultAt;
        prevResultIntervalMs = dtMs > 0 ? dtMs : prevResultIntervalMs;
        const dtSec = Math.min(0.08, Math.max(1 / 240, dtMs / 1000));
        lastResultAt = now;

        const rawLm = results.multiHandLandmarks;
        const landmarksOne = rawLm && rawLm.length ? rawLm.slice(0, 1) : null;
        const hasHands = Boolean(landmarksOne && landmarksOne.length);
        let handsForDraw = null;
        let freezeSmoothing = false;

        if (hasHands) {
          const perm = matchHandsToSlots(landmarksOne);
          handsForDraw = orderHandsForSlots(landmarksOne, perm);
          lastValidHandsNormalized = handsForDraw;
          lastValidTime = now;
        } else if (lastValidHandsNormalized && now - lastValidTime < HYSTERESIS_MS) {
          handsForDraw = lastValidHandsNormalized.slice(0, 1);
          freezeSmoothing = true;
        }

        logMetrics(now, hasHands, prevResultIntervalMs);

        latestFrame = {
          now,
          dtSec,
          handsForDraw,
          freezeSmoothing,
          hasHands,
          landmarksOne,
        };
        requestDraw();
      } catch (err) {
        console.error("[ShadowPlayGround] onResults:", err);
      }
    });

    camera = new Camera(videoEl, {
      onFrame: async () => {
        await handsInstance.send({ image: videoEl });
      },
      width: IDEAL_WIDTH,
      height: IDEAL_HEIGHT,
      facingMode: "user",
    });

    await camera.start();
    tryApplyVideoConstraints();
    resizeCanvases();
    lastResultAt = performance.now();
    drawWallBackground();

    startBtn.textContent = t("start.btnRunning");
    tipEl.textContent = t("start.btnRunning");
    if (startSpinner) startSpinner.classList.add("hidden");
    startOverlay.classList.add("hidden");
    if (stageWrap) stageWrap.classList.add("is-playing");
  } catch (err) {
    console.error(err);
    const code = classifyCameraError(err);
    startBtn.disabled = false;
    startBtn.textContent = t("start.btnRetry");
    tipEl.textContent = messageForCameraCode(code, t);
    if (startSpinner) startSpinner.classList.add("hidden");
    startOverlay.classList.remove("hidden");
    if (stageWrap) stageWrap.classList.remove("is-playing");
  }
}

initI18n();
applyDomI18n(document);

bindStage({ videoEl, outputCanvas, fxCanvas, particleCanvas });
const fxDrawingCtx = fxCanvas.getContext("2d");

window.addEventListener("resize", () => {
  resizeCanvases();
  if (handsInstance) {
    handsInstance.setOptions(getMediaPipeHandsOptions({ performanceMode: isPerformanceMode() }));
  }
});

ShadowGame.init({
  particleCanvas,
  spellNameEl,
  hudSpellEl: document.getElementById("hudSpell"),
  challengeTitleEl: document.getElementById("challengeTitle"),
  comboEl: document.getElementById("comboDisplay"),
  progressEl: document.getElementById("challengeProgress"),
});
try {
  const saved = localStorage.getItem("shadowPlaygroundMode");
  ShadowGame.setMode(
    saved === "challenge" ? "challenge" : saved === "learn" ? "learn" : "free"
  );
} catch {
  ShadowGame.setMode("free");
}
syncModeButtons();
syncSettingsUi();

startBtn.addEventListener("click", () => {
  startCamera();
});

menuBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);
document.addEventListener("keydown", trapSidebarKeydown);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

modeFreeBtn?.addEventListener("click", () => {
  ShadowGame.setMode("free");
  syncModeButtons();
});
modeChallengeBtn?.addEventListener("click", () => {
  ShadowGame.setMode("challenge");
  syncModeButtons();
});
modeLearnBtn?.addEventListener("click", () => {
  ShadowGame.setMode("learn");
  syncModeButtons();
});

perfToggle?.addEventListener("change", () => {
  setPerformanceMode(perfToggle.checked);
  resizeCanvases();
  if (handsInstance) {
    handsInstance.setOptions(getMediaPipeHandsOptions({ performanceMode: isPerformanceMode() }));
  }
});

soundToggle?.addEventListener("change", () => {
  setSoundEnabled(soundToggle.checked);
});

langSelect?.addEventListener("change", () => {
  setLang(langSelect.value === "en" ? "en" : "ko");
  applyDomI18n(document);
  syncSettingsUi();
  ShadowGame.setMode(ShadowGame.getMode());
  syncModeButtons();
});

onLangChange(() => {
  applyDomI18n(document);
  syncSettingsUi();
});
