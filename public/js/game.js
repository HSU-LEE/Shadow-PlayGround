import * as G from "./gestures.js";
import { toPx } from "./render.js";
import {
getChallenges,
getLearnSteps,
gestureDisplayName,
t,
onLangChange,
} from "./i18n.js";
import { getParticleIntensity, isSoundEnabled } from "./settings.js";

function challenges() {
return getChallenges();
}
function learnSteps() {
return getLearnSteps();
}

let mode = "free";
let particleCanvas = null;
let particleCtx = null;
let spellNameElRef = null;
let hudSpellEl = null;
let challengeTitleEl = null;
let comboEl = null;
let progressEl = null;
let challengeIdx = 0;
let learnIdx = 0;
let learnFullCycleComplete = false;
let holdAccumMs = 0;
let combo = 0;
let phase = "active";
let phaseUntil = 0;
const particles = [];
let lastGesture = "none";

function pickRandomChallengeIndex() {
    if (challenges().length < 2) {
      challengeIdx = 0;
      return;
    }
    let next;
    do {
      next = Math.floor(Math.random() * challenges().length);
    } while (next === challengeIdx);
    challengeIdx = next;
}

function playChimeForGesture(gesture) {
    if (!isSoundEnabled()) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const profiles = {
      open_palm: { f0: 659.25, f1: 783.99, t0: "sine", t1: "sine", gap: 0.06, peak: 0.11 },
      fist: { f0: 196, f1: 174.61, t0: "triangle", t1: "triangle", gap: 0.04, peak: 0.1 },
      peace: { f0: 523.25, f1: 659.25, t0: "sine", t1: "sine", gap: 0.09, peak: 0.1 },
      pinch: { f0: 1046.5, f1: null, t0: "sine", t1: null, gap: 0, peak: 0.09 },
      thumbs_up: { f0: 392, f1: 493.88, t0: "sine", t1: "sine", gap: 0.07, peak: 0.12 },
      fox: { f0: 440, f1: 554.37, t0: "sine", t1: "sine", gap: 0.07, peak: 0.1 },
    };
    const p = profiles[gesture] || profiles.open_palm;
    try {
      const ctx = new AC();
      const schedule = (freq, type, tStart, dur, peak) => {
        if (freq == null) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + tStart);
        g.gain.setValueAtTime(0.001, ctx.currentTime + tStart);
        g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + tStart + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tStart + dur);
        osc.start(ctx.currentTime + tStart);
        osc.stop(ctx.currentTime + tStart + dur + 0.02);
      };
      schedule(p.f0, p.t0, 0, 0.2, p.peak);
      if (p.f1 != null) schedule(p.f1, p.t1, p.gap, 0.18, p.peak * 0.85);
      const closeAt = ctx.currentTime + 0.35 + (p.f1 != null ? p.gap : 0);
      setTimeout(() => {
        try {
          ctx.close();
        } catch { /* ignore */ }
      }, Math.ceil((closeAt - ctx.currentTime) * 1000) + 80);
    } catch { /* ignore */ }
}

function handCenterPx(lm, _w, _h) {
    if (!lm || lm.length < 10) return { x: _w * 0.5, y: _h * 0.42 };
    const px = (i) => toPx(lm[i]);
    const a = px(0);
    const b = px(5);
    const c = px(9);
    return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
}

function pushP(base) {
    particles.push({
      x: base.x,
      y: base.y,
      vx: base.vx,
      vy: base.vy,
      life: base.life ?? 0.88,
      age: 0,
      hue: base.hue,
      grav: base.grav ?? 90,
      lightness: base.lightness ?? 72,
      sat: base.sat ?? 85,
      size0: base.size0 ?? 2,
      size1: base.size1 ?? 3,
      kind: base.kind ?? "circle",
      rot: base.rot ?? 0,
      rotSpd: base.rotSpd ?? 0,
    });
}

function spawnGestureClearEffect(gesture, cx, cy, _w, _h) {
    const pi = getParticleIntensity();
    if (pi <= 0.02) return;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pc = (n) => Math.max(1, Math.round(n * pi));

    if (gesture === "open_palm") {
      const n = pc(40);
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + rnd(-0.35, 0.35);
        const sp = rnd(1.4, 3.4) * 46;
        pushP({
          x: cx + rnd(-6, 6),
          y: cy + rnd(-6, 6),
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp + rnd(-30, 10),
          life: rnd(0.95, 1.25),
          hue: rnd(36, 52),
          grav: rnd(28, 48),
          lightness: rnd(74, 86),
          sat: rnd(82, 96),
          size0: 2.2,
          size1: 4.2,
        });
      }
      return;
    }

    if (gesture === "fist") {
      const n = pc(22);
      for (let i = 0; i < n; i++) {
        const ang = rnd(0, Math.PI * 2);
        const sp = rnd(0.3, 1.8) * 55;
        pushP({
          x: cx + rnd(-14, 14),
          y: cy + rnd(-14, 14),
          vx: Math.cos(ang) * sp * 0.35,
          vy: Math.sin(ang) * sp * 0.35 + rnd(10, 40),
          life: rnd(0.55, 0.85),
          hue: rnd(22, 38),
          grav: rnd(120, 175),
          lightness: rnd(48, 62),
          sat: rnd(55, 72),
          size0: 1.8,
          size1: 2.8,
        });
      }
      return;
    }

    if (gesture === "peace") {
      const emit = (ox, oy, bias) => {
        const n = pc(18);
        for (let i = 0; i < n; i++) {
          const ang = (-Math.PI * 0.35 + (Math.PI * 0.7 * i) / (n - 1)) * bias + rnd(-0.2, 0.2);
          const sp = rnd(1.2, 2.6) * 42;
          pushP({
            x: cx + ox + rnd(-4, 4),
            y: cy + oy + rnd(-4, 4),
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - rnd(15, 45),
            life: rnd(0.82, 1.05),
            hue: bias > 0 ? rnd(42, 58) : rnd(155, 175),
            grav: rnd(55, 78),
            lightness: rnd(70, 82),
            sat: rnd(78, 92),
            size0: 2,
            size1: 3.6,
          });
        }
      };
      emit(-72, -8, 1);
      emit(72, -8, -1);
      return;
    }

    if (gesture === "pinch") {
      const n = pc(16);
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + rnd(-0.15, 0.15);
        const sp = rnd(2.2, 4.2) * 38;
        pushP({
          x: cx + rnd(-3, 3),
          y: cy + rnd(-3, 3),
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - rnd(25, 55),
          life: rnd(0.45, 0.72),
          hue: rnd(275, 305),
          grav: rnd(70, 95),
          lightness: rnd(68, 80),
          sat: rnd(88, 98),
          size0: 1.4,
          size1: 2.4,
          kind: "star",
          rot: rnd(0, Math.PI * 2),
          rotSpd: rnd(-5, 5),
        });
      }
      return;
    }

    if (gesture === "thumbs_up") {
      const n = pc(30);
      for (let i = 0; i < n; i++) {
        const ang = rnd(-Math.PI * 0.55, Math.PI * 0.55) - Math.PI * 0.5;
        const sp = rnd(0.8, 2.4) * 40;
        pushP({
          x: cx + rnd(-10, 10),
          y: cy + rnd(4, 18),
          vx: Math.cos(ang) * sp * 0.65 + rnd(-25, 25),
          vy: -rnd(95, 165) + Math.sin(ang) * sp * 0.25,
          life: rnd(0.75, 1.05),
          hue: rnd(44, 56),
          grav: rnd(38, 62),
          lightness: rnd(72, 84),
          sat: rnd(86, 96),
          size0: 2,
          size1: 3.8,
        });
      }
      return;
    }

    if (gesture === "fox") {
      const n = pc(32);
      for (let i = 0; i < n; i++) {
        const ang = rnd(-Math.PI * 0.65, Math.PI * 0.65) - Math.PI * 0.5;
        const sp = rnd(0.9, 2.2) * 42;
        pushP({
          x: cx + rnd(-12, 12),
          y: cy + rnd(-6, 14),
          vx: Math.cos(ang) * sp + rnd(-18, 18),
          vy: -rnd(55, 120) + Math.sin(ang) * sp * 0.35,
          life: rnd(0.78, 1.08),
          hue: rnd(18, 42),
          grav: rnd(42, 68),
          lightness: rnd(66, 80),
          sat: rnd(80, 96),
          size0: 1.9,
          size1: 3.6,
        });
      }
      return;
    }

    const n = pc(26);
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + rnd(-0.3, 0.3);
      const sp = rnd(1.2, 2.8) * 40;
      pushP({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 18,
        life: rnd(0.8, 1.05),
        hue: rnd(34, 58),
        grav: 90,
      });
    }
}

function updateParticles(dtSec, w, h) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += (p.grav ?? 90) * dtSec;
      if (p.rotSpd) p.rot += p.rotSpd * dtSec;
      if (p.age > p.life || p.y > h + 40 || p.x < -40 || p.x > w + 40) particles.splice(i, 1);
    }
}

function drawParticles(w, h) {
    if (!particleCtx) return;
    particleCtx.clearRect(0, 0, w, h);
    for (const p of particles) {
      const t = 1 - p.age / p.life;
      particleCtx.globalAlpha = Math.max(0, t * 0.9);
      const L = p.lightness ?? 72;
      const S = p.sat ?? 85;
      particleCtx.fillStyle = `hsla(${p.hue}, ${S}%, ${L}%, 1)`;
      const r = (p.size0 ?? 2) + (p.size1 ?? 3) * t;
      if (p.kind === "star") {
        particleCtx.save();
        particleCtx.translate(p.x, p.y);
        particleCtx.rotate(p.rot || 0);
        particleCtx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (Math.PI / 2) * k;
          particleCtx.moveTo(0, 0);
          particleCtx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
        }
        particleCtx.fill();
        particleCtx.restore();
      } else {
        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
        particleCtx.fill();
      }
    }
    particleCtx.globalAlpha = 1;
}

function setSpellText(spell, sub) {
    if (spellNameElRef) spellNameElRef.textContent = spell + (sub ? ` — ${sub}` : "");
    if (hudSpellEl) hudSpellEl.textContent = spell;
}

function setHudChallenge(title, prog01) {
    if (challengeTitleEl) challengeTitleEl.textContent = title;
    if (progressEl) progressEl.style.transform = `scaleX(${Math.max(0, Math.min(1, prog01))})`;
}

function currentChallenge() {
    return challenges()[challengeIdx % challenges().length];
}

function activeStep() {
    if (mode === "learn") return learnSteps()[learnIdx % learnSteps().length];
    return challenges()[challengeIdx % challenges().length];
}

function advanceChallenge() {
    pickRandomChallengeIndex();
    holdAccumMs = 0;
}

function advanceLearn() {
    learnIdx = (learnIdx + 1) % learnSteps().length;
    holdAccumMs = 0;
}

function setMode(m) {
    mode = m === "challenge" ? "challenge" : m === "learn" ? "learn" : "free";
    phase = "active";
    holdAccumMs = 0;
    learnFullCycleComplete = false;
    try {
      localStorage.setItem("shadowPlaygroundMode", mode);
    } catch { /* ignore */ }
    if (mode === "challenge") {
      learnIdx = 0;
      pickRandomChallengeIndex();
      combo = 0;
      const c = currentChallenge();
      setHudChallenge(c.title, 0);
      setSpellText(c.spell, t("hud.challengeTag"));
      if (comboEl) comboEl.textContent = `${t("combo.level")} ${combo}`;
    } else if (mode === "learn") {
      learnIdx = 0;
      combo = 0;
      const L = learnSteps()[learnIdx % learnSteps().length];
      setHudChallenge(L.title, 0);
      setSpellText(L.spell, t("hud.learnTag"));
      if (comboEl) comboEl.textContent = `${t("combo.task")} ${learnIdx + 1}/${learnSteps().length}`;
    } else {
      learnIdx = 0;
      setHudChallenge(t("hud.freeLine"), 0);
      setSpellText(t("gesture.other"), "");
      if (comboEl) comboEl.textContent = "";
    }
}

function tick(opts) {
    const { now, dtSec, handsLmArray, hasHands, width, height } = opts;
    const w = width || 1;
    const h = height || 1;

    let gesture = "none";
    if (hasHands && handsLmArray && handsLmArray.length > 0 && G) {
      gesture = G.detectPrimaryGesture(handsLmArray[0]) || "other";
    }
    lastGesture = gesture;

    if (phase === "success" || phase === "fail") {
      if (now >= phaseUntil) {
        phase = "active";
        holdAccumMs = 0;
        if (mode === "challenge") {
          const c = currentChallenge();
          setHudChallenge(c.title, 0);
          setSpellText(c.spell, t("hud.challengeTag"));
          if (comboEl) comboEl.textContent = `${t("combo.level")} ${combo}`;
        } else if (mode === "learn") {
          if (learnFullCycleComplete) {
            learnFullCycleComplete = false;
            learnIdx = 0;
            const L = learnSteps()[0];
            setHudChallenge(L.title, 0);
            setSpellText(L.spell, t("hud.learnTag"));
            if (comboEl) comboEl.textContent = `${t("combo.task")} ${learnIdx + 1}/${learnSteps().length}`;
          } else {
            const L = activeStep();
            setHudChallenge(L.title, 0);
            setSpellText(L.spell, t("hud.learnTag"));
            if (comboEl) comboEl.textContent = `${t("combo.task")} ${learnIdx + 1}/${learnSteps().length}`;
          }
        }
      }
      updateParticles(dtSec, w, h);
      drawParticles(w, h);
      return { mode, gesture, combo, phase };
    }

    if (mode === "free") {
      const label = gestureDisplayName(hasHands ? gesture : "none");
      setSpellText(label, t("hud.freeSubtitle"));
      setHudChallenge(t("hud.freeLine"), 0);
      if (comboEl) comboEl.textContent = "";
      updateParticles(dtSec, w, h);
      drawParticles(w, h);
      return { mode, gesture, combo, phase };
    }

    const step = activeStep();
    if (!hasHands) {
      holdAccumMs = Math.max(0, holdAccumMs - dtSec * 800);
      setHudChallenge(step.title, holdAccumMs / step.holdMs);
      if (comboEl) {
        comboEl.textContent =
          mode === "learn" ? `${t("combo.task")} ${learnIdx + 1}/${learnSteps().length}` : `${t("combo.level")} ${combo}`;
      }
      updateParticles(dtSec, w, h);
      drawParticles(w, h);
      return { mode, gesture: "none", combo, phase };
    }

    const match = gesture === step.target;
    if (match) holdAccumMs += dtSec * 1000;
    else holdAccumMs = Math.max(0, holdAccumMs - dtSec * 1200);

    const prog = holdAccumMs / step.holdMs;
    setHudChallenge(step.title, prog);
    if (comboEl) {
      comboEl.textContent =
        mode === "learn" ? `${t("combo.task")} ${learnIdx + 1}/${learnSteps().length}` : `${t("combo.level")} ${combo}`;
    }

    if (holdAccumMs >= step.holdMs) {
      combo += 1;
      const clearedGesture = step.target;
      const anchor =
        hasHands && handsLmArray && handsLmArray[0]
          ? handCenterPx(handsLmArray[0], w, h)
          : { x: w * 0.5, y: h * 0.42 };
      playChimeForGesture(clearedGesture);
      spawnGestureClearEffect(clearedGesture, anchor.x, anchor.y, w, h);
      phase = "success";
      const learnLastStep = mode === "learn" && learnIdx === learnSteps().length - 1;
      phaseUntil = now + (learnLastStep ? 2600 : 900);
      setSpellText(step.spell, t("hud.success"));
      if (mode === "learn") {
        if (learnLastStep) {
          learnFullCycleComplete = true;
        } else {
          advanceLearn();
        }
      } else {
        advanceChallenge();
      }
      if (mode === "learn" && learnFullCycleComplete) {
        setHudChallenge(t("hud.learnDoneTitle"), 1);
        setSpellText(t("hud.learnDoneSpell"), t("hud.learnDoneCombo"));
        if (comboEl) comboEl.textContent = t("hud.learnDoneCombo");
      } else {
        const next = activeStep();
        setHudChallenge(next.title, 0);
        setSpellText(next.spell, mode === "learn" ? t("hud.learnNext") : t("hud.challengeNext"));
        if (mode === "learn" && comboEl) {
          comboEl.textContent = `${t("combo.task")} ${learnIdx + 1}/${learnSteps().length}`;
        }
      }
    }

    updateParticles(dtSec, w, h);
    drawParticles(w, h);
    return { mode, gesture, combo, phase };
}

function init(opts) {
    particleCanvas = opts.particleCanvas;
    particleCtx = particleCanvas ? particleCanvas.getContext("2d") : null;
    spellNameElRef = opts.spellNameEl;
    hudSpellEl = opts.hudSpellEl;
    challengeTitleEl = opts.challengeTitleEl;
    comboEl = opts.comboEl;
    progressEl = opts.progressEl;
    if (particleCtx) particleCtx.imageSmoothingEnabled = true;
}

onLangChange(() => {
  try {
    const m = mode;
    setMode(m);
  } catch {
    /* ignore */
  }
});

export const ShadowGame = {
  init,
  setMode,
  tick,
  getMode: () => mode,
  getCombo: () => combo,
  getLastGesture: () => lastGesture,
};
