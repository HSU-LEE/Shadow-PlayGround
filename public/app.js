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
const spellNameEl = document.getElementById("spellName");
const particleCanvas = document.getElementById("particleCanvas");
const stageWrap = document.querySelector(".stage-wrap");
const modeFreeBtn = document.getElementById("modeFreeBtn");
const modeChallengeBtn = document.getElementById("modeChallengeBtn");
const modeLearnBtn = document.getElementById("modeLearnBtn");

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
};

(function (global) {
  function distLm(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy) || 0;
  }
  function handScaleLm(lm) {
    return Math.max(distLm(lm[5], lm[17]), distLm(lm[0], lm[9]), 0.04);
  }
  function fingerExtended(lm, tip, pip, mcp) {
    const scale = handScaleLm(lm);
    const dTip = distLm(lm[tip], lm[0]);
    const dPip = distLm(lm[pip], lm[0]);
    if (dTip < dPip * 1.06) return false;
    if (dTip < scale * 0.28) return false;
    const dMcp = distLm(lm[mcp], lm[0]);
    return dTip > dMcp * 0.92;
  }
  function thumbExtended(lm) {
    const scale = handScaleLm(lm);
    const dTip = distLm(lm[4], lm[0]);
    const dIp = distLm(lm[3], lm[0]);
    if (dTip < dIp * 1.02) return false;
    return distLm(lm[4], lm[8]) > scale * 0.22 && dTip > scale * 0.2;
  }
  function countExtendedFingers(lm) {
    let n = 0;
    if (thumbExtended(lm)) n += 1;
    if (fingerExtended(lm, 8, 6, 5)) n += 1;
    if (fingerExtended(lm, 12, 10, 9)) n += 1;
    if (fingerExtended(lm, 16, 14, 13)) n += 1;
    if (fingerExtended(lm, 20, 18, 17)) n += 1;
    return n;
  }
  function isPinch(lm) {
    const scale = handScaleLm(lm);
    return distLm(lm[4], lm[8]) < scale * 0.35;
  }

  function fingerCurledForFist(lm, tip, pip, mcp) {
    const scale = handScaleLm(lm);
    const dTip = distLm(lm[tip], lm[0]);
    const dPip = distLm(lm[pip], lm[0]);
    const dMcp = distLm(lm[mcp], lm[0]);
    if (dTip <= dPip * 1.34) return true;
    if (distLm(lm[tip], lm[pip]) < scale * 0.46) return true;
    if (dTip < dMcp * 0.98) return true;
    return false;
  }

  function fourNonThumbCurledForFist(lm) {
    return (
      fingerCurledForFist(lm, 8, 6, 5) &&
      fingerCurledForFist(lm, 12, 10, 9) &&
      fingerCurledForFist(lm, 16, 14, 13) &&
      fingerCurledForFist(lm, 20, 18, 17)
    );
  }

  function countNonThumbCurledForFist(lm) {
    let n = 0;
    if (fingerCurledForFist(lm, 8, 6, 5)) n += 1;
    if (fingerCurledForFist(lm, 12, 10, 9)) n += 1;
    if (fingerCurledForFist(lm, 16, 14, 13)) n += 1;
    if (fingerCurledForFist(lm, 20, 18, 17)) n += 1;
    return n;
  }

  function detectPrimaryGesture(lm) {
    if (!lm || lm.length < 21) return null;
    if (handScaleLm(lm) < 0.03) return null;
    const scale = handScaleLm(lm);
    const ext = countExtendedFingers(lm);
    const idx = fingerExtended(lm, 8, 6, 5);
    const mid = fingerExtended(lm, 12, 10, 9);
    const ring = fingerExtended(lm, 16, 14, 13);
    const pink = fingerExtended(lm, 20, 18, 17);
    const th = thumbExtended(lm);
    if (ext >= 4) return "open_palm";

    if (th && idx && pink && !mid && !ring) return "fox";
    if (idx && mid && !ring && !pink) return "peace";

    if (fourNonThumbCurledForFist(lm)) {
      const thumbIndexGap = distLm(lm[4], lm[8]);
      if (th && thumbIndexGap > scale * 0.38) return "thumbs_up";
      return "fist";
    }

    if (isPinch(lm)) return "pinch";

    if (ext <= 1 && th) return "thumbs_up";
    if (ext <= 1) return "fist";

    const curled = countNonThumbCurledForFist(lm);
    if (curled >= 3 && ext <= 2) return "fist";

    return "other";
  }
  const LABELS = {
    open_palm: "새 날개 (손바닥 펼침)",
    fist: "곰 (주먹)",
    peace: "토끼 귀 (브이)",
    thumbs_up: "강아지 (엄지척)",
    pinch: "오리 부리 (집게)",
    fox: "여우 얼굴",
    other: "그림자 연습",
    none: "손을 비춰 주세요",
  };
  global.ShadowGestures = {
    detectPrimaryGesture,
    countExtendedFingers,
    gestureLabel: (id) => LABELS[id] || LABELS.other,
  };
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  const G = global.ShadowGestures;
  const CHALLENGES = [
    { id: "c1", target: "open_palm", holdMs: 2200, title: "손바닥을 펼쳐 새 날개 그림자를 만들어 보세요", spell: "새 날개 (손바닥 펼침)" },
    { id: "c2", target: "fist", holdMs: 2000, title: "손가락을 말아 곰(주먹)을 만들어 보세요", spell: "곰 (주먹)" },
    { id: "c3", target: "peace", holdMs: 2200, title: "검지·중지로 토끼 귀(브이)를 만들어 보세요", spell: "토끼 귀 (브이)" },
    { id: "c4", target: "thumbs_up", holdMs: 1800, title: "엄지를 세워 강아지 인사를 해 보세요", spell: "강아지 (엄지척)" },
    { id: "c5", target: "fox", holdMs: 2600, title: "엄지·검지·새끼만 펴 여우 얼굴을 만들어 보세요", spell: "여우 얼굴" },
    { id: "c6", target: "pinch", holdMs: 2000, title: "엄지와 검지를 붙여 오리 부리를 만들어 보세요", spell: "오리 부리 (집게)" },
  ];

  const LEARN_STEPS = [
    {
      id: "learn1",
      target: "peace",
      holdMs: 2200,
      title: "검지·중지만 펼쳐 토끼 귀(브이)를 만들어 보세요",
      spell: "토끼 귀 (브이)",
    },
    {
      id: "learn2",
      target: "fox",
      holdMs: 2600,
      title: "엄지·검지·새끼만 펴고 중지·약지는 접어 여우 얼굴을 만들어 보세요",
      spell: "여우 얼굴",
    },
    {
      id: "learn3",
      target: "open_palm",
      holdMs: 2200,
      title: "손가락을 쭉 펴 손바닥을 펼쳐 새 날개처럼 보이게 해 보세요",
      spell: "새 날개 (손바닥 펼침)",
    },
    {
      id: "learn4",
      target: "fist",
      holdMs: 2000,
      title: "손가락을 말아 주먹을 쥐어 곰을 만들어 보세요",
      spell: "곰 (주먹)",
    },
    {
      id: "learn5",
      target: "thumbs_up",
      holdMs: 1800,
      title: "엄지를 세워 강아지 인사를 해 보세요",
      spell: "강아지 (엄지척)",
    },
    {
      id: "learn6",
      target: "pinch",
      holdMs: 2000,
      title: "엄지와 검지 끝을 붙여 오리 부리를 만들어 보세요",
      spell: "오리 부리 (집게)",
    },
  ];

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
    if (CHALLENGES.length < 2) {
      challengeIdx = 0;
      return;
    }
    let next;
    do {
      next = Math.floor(Math.random() * CHALLENGES.length);
    } while (next === challengeIdx);
    challengeIdx = next;
  }

  function playChimeForGesture(gesture) {
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
        } catch (_) {}
      }, Math.ceil((closeAt - ctx.currentTime) * 1000) + 80);
    } catch (_) {}
  }

  function handCenterPx(lm, w, h) {
    if (!lm || lm.length < 10) return { x: w * 0.5, y: h * 0.42 };
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

  function spawnGestureClearEffect(gesture, cx, cy, w, h) {
    const rnd = (a, b) => a + Math.random() * (b - a);

    if (gesture === "open_palm") {
      const n = 40;
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
      const n = 22;
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
        const n = 18;
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
      const n = 16;
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
      const n = 30;
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
      const n = 32;
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

    const n = 26;
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
    return CHALLENGES[challengeIdx % CHALLENGES.length];
  }

  function activeStep() {
    if (mode === "learn") return LEARN_STEPS[learnIdx % LEARN_STEPS.length];
    return CHALLENGES[challengeIdx % CHALLENGES.length];
  }

  function advanceChallenge() {
    pickRandomChallengeIndex();
    holdAccumMs = 0;
  }

  function advanceLearn() {
    learnIdx = (learnIdx + 1) % LEARN_STEPS.length;
    holdAccumMs = 0;
  }

  function setMode(m) {
    mode = m === "challenge" ? "challenge" : m === "learn" ? "learn" : "free";
    phase = "active";
    holdAccumMs = 0;
    learnFullCycleComplete = false;
    try {
      localStorage.setItem("shadowPlaygroundMode", mode);
    } catch (_) {}
    if (mode === "challenge") {
      learnIdx = 0;
      pickRandomChallengeIndex();
      combo = 0;
      const c = currentChallenge();
      setHudChallenge(c.title, 0);
      setSpellText(c.spell, "챌린지");
      if (comboEl) comboEl.textContent = `Level ${combo}`;
    } else if (mode === "learn") {
      learnIdx = 0;
      combo = 0;
      const L = LEARN_STEPS[learnIdx % LEARN_STEPS.length];
      setHudChallenge(L.title, 0);
      setSpellText(L.spell, "동물 연습");
      if (comboEl) comboEl.textContent = `과제 ${learnIdx + 1}/${LEARN_STEPS.length}`;
    } else {
      learnIdx = 0;
      setHudChallenge("'손 모양을 바꿔 그림자 극장을 즐겨 보세요'", 0);
      setSpellText("그림자 연습", "");
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
          setSpellText(c.spell, "챌린지");
          if (comboEl) comboEl.textContent = `Level ${combo}`;
        } else if (mode === "learn") {
          if (learnFullCycleComplete) {
            learnFullCycleComplete = false;
            learnIdx = 0;
            const L = LEARN_STEPS[0];
            setHudChallenge(L.title, 0);
            setSpellText(L.spell, "동물 연습");
            if (comboEl) comboEl.textContent = `과제 ${learnIdx + 1}/${LEARN_STEPS.length}`;
          } else {
            const L = activeStep();
            setHudChallenge(L.title, 0);
            setSpellText(L.spell, "동물 연습");
            if (comboEl) comboEl.textContent = `과제 ${learnIdx + 1}/${LEARN_STEPS.length}`;
          }
        }
      }
      updateParticles(dtSec, w, h);
      drawParticles(w, h);
      return { mode, gesture, combo, phase };
    }

    if (mode === "free") {
      const label = hasHands && G ? G.gestureLabel(gesture) : G ? G.gestureLabel("none") : "손을 비춰 주세요";
      setSpellText(label, "자유 모드");
      setHudChallenge("'손 모양을 바꿔 그림자 극장을 즐겨 보세요'", 0);
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
          mode === "learn" ? `과제 ${learnIdx + 1}/${LEARN_STEPS.length}` : `Level ${combo}`;
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
        mode === "learn" ? `과제 ${learnIdx + 1}/${LEARN_STEPS.length}` : `Level ${combo}`;
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
      const learnLastStep = mode === "learn" && learnIdx === LEARN_STEPS.length - 1;
      phaseUntil = now + (learnLastStep ? 2600 : 900);
      setSpellText(step.spell, "성공!");
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
        setHudChallenge("동물 연습을 모두 마쳤어요! 잘했어요 : )", 1);
        setSpellText("동물 연습 끝!", "전체 완료");
        if (comboEl) comboEl.textContent = "모든 과제를 완료했어요";
      } else {
        const next = activeStep();
        setHudChallenge(next.title, 0);
        setSpellText(next.spell, mode === "learn" ? "다음 동물" : "다음 과제");
        if (mode === "learn" && comboEl) {
          comboEl.textContent = `과제 ${learnIdx + 1}/${LEARN_STEPS.length}`;
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

  global.ShadowGame = {
    init,
    setMode,
    tick,
    getMode: () => mode,
    getCombo: () => combo,
    getLastGesture: () => lastGesture,
  };
})(typeof window !== "undefined" ? window : globalThis);

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
    maxNumHands: 1,
    modelComplexity,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.68,
  };
}

function wristPxFromLandmarks(handLm) {
  return toPx(handLm[0]);
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
  if (particleCanvas) {
    particleCanvas.width = width;
    particleCanvas.height = height;
  }
}

window.addEventListener("resize", resizeCanvases);

function toPx(lm) {
  const vw = videoEl.videoWidth || width;
  const vh = videoEl.videoHeight || height;
  const cw = width;
  const ch = height;
  const nx = 1 - lm.x;
  const ny = lm.y;

  const videoAR = vw / vh;
  const canvasAR = cw / ch;
  const useCover =
    videoEl.videoWidth > 0 &&
    videoEl.videoHeight > 0 &&
    Math.abs(videoAR - canvasAR) >= 0.004;

  if (!useCover) {
    return {
      x: nx * cw,
      y: ny * ch,
      z: lm.z || 0,
    };
  }

  const scale = Math.max(cw / vw, ch / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (cw - dispW) * 0.5;
  const offY = (ch - dispH) * 0.5;

  return {
    x: nx * vw * scale + offX,
    y: ny * vh * scale + offY,
    z: lm.z || 0,
  };
}

function drawWallBackground(lightX = width * 0.5, lightY = height * 0.44, radius = 320, moodCombo = 0) {
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.fillStyle = "#000";
  outputCtx.fillRect(0, 0, width, height);

  const t = Math.min(1, Math.max(0, moodCombo / 10));
  const r0 = Math.round(236 + 18 * t);
  const g0 = Math.round(206 + 22 * t);
  const b0 = Math.round(150 + 12 * t);
  const a0 = 0.72 + 0.1 * t;

  const wall = outputCtx.createRadialGradient(lightX, lightY, 30, lightX, lightY, radius);
  wall.addColorStop(0, `rgba(${r0}, ${g0}, ${b0}, ${a0})`);
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

      if (typeof ShadowGame !== "undefined" && ShadowGame.tick) {
        ShadowGame.tick({
          now,
          dtSec,
          handsLmArray: landmarksOne,
          hasHands,
          width,
          height,
        });
      }

      const moodCombo = typeof ShadowGame !== "undefined" && ShadowGame.getCombo ? ShadowGame.getCombo() : 0;
      if (handsForDraw && handsForDraw.length > 0) {
        const lightInfo = getSmoothedWallLighting(handsForDraw, dtSec);
        drawWallBackground(lightInfo.centerX, lightInfo.centerY, lightInfo.radius, moodCombo);
        drawShadowStage(handsForDraw, dtSec, { freezeSmoothing });
      } else {
        drawWallBackground(undefined, undefined, undefined, moodCombo);
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
  drawWallBackground();

  startBtn.textContent = "실행 중";
  tipEl.textContent = "실행 중";
  startOverlay.classList.add("hidden");
  if (stageWrap) stageWrap.classList.add("is-playing");
}

startBtn.addEventListener("click", () => {
  startCamera().catch((err) => {
    console.error(err);
    startBtn.disabled = false;
    startBtn.textContent = "다시 시작";
    tipEl.textContent = "카메라 접근 권한을 허용한 뒤 다시 시도해 주세요.";
    startOverlay.classList.remove("hidden");
    if (stageWrap) stageWrap.classList.remove("is-playing");
  });
});

menuBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

function syncModeButtons() {
  if (!modeFreeBtn || !modeChallengeBtn || typeof ShadowGame === "undefined") return;
  const m = ShadowGame.getMode();
  modeFreeBtn.classList.toggle("mode-btn-active", m === "free");
  modeChallengeBtn.classList.toggle("mode-btn-active", m === "challenge");
  if (modeLearnBtn) modeLearnBtn.classList.toggle("mode-btn-active", m === "learn");
}

if (typeof ShadowGame !== "undefined" && ShadowGame.init) {
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
  } catch (_) {
    ShadowGame.setMode("free");
  }
  syncModeButtons();
}

if (modeFreeBtn && modeChallengeBtn) {
  modeFreeBtn.addEventListener("click", () => {
    ShadowGame.setMode("free");
    syncModeButtons();
  });
  modeChallengeBtn.addEventListener("click", () => {
    ShadowGame.setMode("challenge");
    syncModeButtons();
  });
}
if (modeLearnBtn) {
  modeLearnBtn.addEventListener("click", () => {
    ShadowGame.setMode("learn");
    syncModeButtons();
  });
}
