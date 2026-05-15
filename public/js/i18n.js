const LS_LANG = "shadowPlaygroundLang";

const STR = {
  ko: {
    "meta.title": "Shadow PlayGround",
    "start.btn": "시작",
    "start.btnLoading": "카메라 연결 중…",
    "start.btnRunning": "실행 중",
    "start.btnRetry": "다시 시작",
    "start.tipDefault": "조명에 손을 올려 그림자를 만들어보세요 : )",
    "camera.denied":
      "카메라 권한이 거부되었습니다. 브라우저 주소창 왼쪽의 자물쇠 아이콘에서 카메라를 허용한 뒤 다시 시도해 주세요.",
    "camera.noDevice": "사용할 수 있는 카메라를 찾지 못했습니다. 기기 연결을 확인해 주세요.",
    "camera.inUse": "카메라를 다른 앱에서 사용 중일 수 있습니다. 해당 앱을 닫고 다시 시도해 주세요.",
    "camera.constraint": "카메라 설정을 만족하지 못했습니다. 다른 브라우저로 시도해 보세요.",
    "camera.insecure": "보안 연결(HTTPS) 또는 localhost에서만 카메라를 사용할 수 있습니다.",
    "camera.unknown": "카메라를 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
    "hud.freeLine": "손 모양을 바꿔 그림자 극장을 즐겨 보세요",
    "hud.freeSubtitle": "자유 모드",
    "hud.challengeTag": "챌린지",
    "hud.learnTag": "동물 연습",
    "hud.learnNext": "다음 동물",
    "hud.challengeNext": "다음 과제",
    "hud.success": "성공!",
    "hud.learnDoneTitle": "동물 연습을 모두 마쳤어요! 잘했어요 : )",
    "hud.learnDoneSpell": "동물 연습 끝!",
    "hud.learnDoneCombo": "모든 과제를 완료했어요",
    "combo.level": "Level",
    "combo.task": "과제",
    "gesture.open_palm": "새 날개 (손바닥 펼침)",
    "gesture.fist": "곰 (주먹)",
    "gesture.peace": "토끼 귀 (브이)",
    "gesture.thumbs_up": "강아지 (엄지척)",
    "gesture.pinch": "오리 부리 (집게)",
    "gesture.fox": "여우 얼굴",
    "gesture.other": "그림자 연습",
    "gesture.none": "손을 비춰 주세요",
    "coach.dim": "손이 잘 안 잡히면 조명을 더 밝게 해 보세요",
    "coach.oneHand": "한 손만 화면 중앙 쪽에 두면 더 안정적이에요",
    "sidebar.playModes": "플레이 모드",
    "sidebar.modeFree": "자유 모드",
    "sidebar.modeChallenge": "챌린지",
    "sidebar.modeLearn": "동물 연습",
    "sidebar.about": "설명",
    "sidebar.aboutBody":
      "조명에 손을 올려 그림자를 만들어보세요 : ) 인식이 불안정하면 손을 화면 중앙 또는 밝은 쪽으로 두고, 얼굴 대신 손이 카메라에 잘 보이게 해 주세요.",
    "sidebar.learnHint":
      "동물 연습에서는 토끼·여우·새·곰·강아지·오리처럼 그림자 놀이에 쓰기 쉬운 손모양을 순서대로 익힐 수 있어요. 화면 안내에 맞춰 잠시 유지하면 다음 단계로 넘어갑니다.",
    "sidebar.support": "개발자 커피 사주기",
    "sidebar.contact": "버그 제보 및 문의",
    "sidebar.github": "GitHub",
    "sidebar.settings": "설정",
    "settings.perf": "성능 모드 (낮은 해상도·가벼운 효과)",
    "settings.sound": "효과음",
    "settings.lang": "언어",
    "aria.menuOpen": "메뉴 열기",
    "aria.menuClose": "메뉴 닫기",
    "aria.sidebar": "프로젝트 메뉴",
    "aria.playModeGroup": "플레이 모드",
  },
  en: {
    "meta.title": "Shadow PlayGround",
    "start.btn": "Start",
    "start.btnLoading": "Connecting camera…",
    "start.btnRunning": "Running",
    "start.btnRetry": "Try again",
    "start.tipDefault": "Raise your hands toward the light and play with shadows : )",
    "camera.denied":
      "Camera permission was denied. Use the lock icon in the address bar to allow the camera, then try again.",
    "camera.noDevice": "No usable camera was found. Check that a camera is connected.",
    "camera.inUse": "The camera may be in use by another app. Close it and try again.",
    "camera.constraint": "The camera could not satisfy the requested settings. Try another browser.",
    "camera.insecure": "Camera access requires HTTPS or localhost.",
    "camera.unknown": "Could not start the camera. Refresh the page and try again.",
    "hud.freeLine": "Change hand shapes and enjoy your shadow theater",
    "hud.freeSubtitle": "Free play",
    "hud.challengeTag": "Challenge",
    "hud.learnTag": "Animal practice",
    "hud.learnNext": "Next animal",
    "hud.challengeNext": "Next challenge",
    "hud.success": "Nice!",
    "hud.learnDoneTitle": "You finished every animal practice step — great job!",
    "hud.learnDoneSpell": "Practice complete!",
    "hud.learnDoneCombo": "All steps cleared",
    "combo.level": "Level",
    "combo.task": "Step",
    "gesture.open_palm": "Bird wings (open palm)",
    "gesture.fist": "Bear (fist)",
    "gesture.peace": "Bunny ears (peace)",
    "gesture.thumbs_up": "Puppy (thumbs up)",
    "gesture.pinch": "Duck bill (pinch)",
    "gesture.fox": "Fox face",
    "gesture.other": "Shadow play",
    "gesture.none": "Show your hands",
    "coach.dim": "If tracking is shaky, try brighter light on your hands",
    "coach.oneHand": "One hand near the center is often more stable",
    "sidebar.playModes": "Play mode",
    "sidebar.modeFree": "Free play",
    "sidebar.modeChallenge": "Challenge",
    "sidebar.modeLearn": "Animal practice",
    "sidebar.about": "About",
    "sidebar.aboutBody":
      "Play with shadows toward a light. If tracking is unstable, keep your hands near the center and brighter than your face.",
    "sidebar.learnHint":
      "Animal practice walks through easy shadow shapes (bunny, fox, bird, bear, puppy, duck). Hold each pose until the bar fills.",
    "sidebar.support": "Support the developer",
    "sidebar.contact": "Bugs & contact",
    "sidebar.github": "GitHub",
    "sidebar.settings": "Settings",
    "settings.perf": "Performance mode (lower resolution, lighter effects)",
    "settings.sound": "Sound effects",
    "settings.lang": "Language",
    "aria.menuOpen": "Open menu",
    "aria.menuClose": "Close menu",
    "aria.sidebar": "Project menu",
    "aria.playModeGroup": "Play mode",
  },
};

function challengesFor(lang) {
  const L = lang === "en" ? "en" : "ko";
  if (L === "en") {
    return [
      {
        id: "c1",
        target: "open_palm",
        holdMs: 2200,
        title: "Spread your palm to make bird-wing shadows",
        spell: "Bird wings (open palm)",
      },
      {
        id: "c2",
        target: "fist",
        holdMs: 2000,
        title: "Curl your fingers into a bear (fist)",
        spell: "Bear (fist)",
      },
      {
        id: "c3",
        target: "peace",
        holdMs: 2200,
        title: "Index and middle finger up for bunny ears (peace)",
        spell: "Bunny ears (peace)",
      },
      {
        id: "c4",
        target: "thumbs_up",
        holdMs: 1800,
        title: "Thumbs up for a puppy wave",
        spell: "Puppy (thumbs up)",
      },
      {
        id: "c5",
        target: "fox",
        holdMs: 2600,
        title: "Thumb, index, and pinky out for a fox face",
        spell: "Fox face",
      },
      {
        id: "c6",
        target: "pinch",
        holdMs: 2000,
        title: "Pinch thumb and index for a duck bill",
        spell: "Duck bill (pinch)",
      },
    ];
  }
  return [
    {
      id: "c1",
      target: "open_palm",
      holdMs: 2200,
      title: "손바닥을 펼쳐 새 날개 그림자를 만들어 보세요",
      spell: "새 날개 (손바닥 펼침)",
    },
    {
      id: "c2",
      target: "fist",
      holdMs: 2000,
      title: "손가락을 말아 곰(주먹)을 만들어 보세요",
      spell: "곰 (주먹)",
    },
    {
      id: "c3",
      target: "peace",
      holdMs: 2200,
      title: "검지·중지로 토끼 귀(브이)를 만들어 보세요",
      spell: "토끼 귀 (브이)",
    },
    {
      id: "c4",
      target: "thumbs_up",
      holdMs: 1800,
      title: "엄지를 세워 강아지 인사를 해 보세요",
      spell: "강아지 (엄지척)",
    },
    {
      id: "c5",
      target: "fox",
      holdMs: 2600,
      title: "엄지·검지·새끼만 펴 여우 얼굴을 만들어 보세요",
      spell: "여우 얼굴",
    },
    {
      id: "c6",
      target: "pinch",
      holdMs: 2000,
      title: "엄지와 검지를 붙여 오리 부리를 만들어 보세요",
      spell: "오리 부리 (집게)",
    },
  ];
}

function learnStepsFor(lang) {
  const L = lang === "en" ? "en" : "ko";
  if (L === "en") {
    return [
      {
        id: "learn1",
        target: "peace",
        holdMs: 2200,
        title: "Only index and middle up — bunny ears (peace)",
        spell: "Bunny ears (peace)",
      },
      {
        id: "learn2",
        target: "fox",
        holdMs: 2600,
        title: "Thumb, index, pinky out; middle and ring folded — fox face",
        spell: "Fox face",
      },
      {
        id: "learn3",
        target: "open_palm",
        holdMs: 2200,
        title: "Stretch fingers wide like bird wings",
        spell: "Bird wings (open palm)",
      },
      {
        id: "learn4",
        target: "fist",
        holdMs: 2000,
        title: "Curl into a fist for the bear",
        spell: "Bear (fist)",
      },
      {
        id: "learn5",
        target: "thumbs_up",
        holdMs: 1800,
        title: "Thumbs up for the puppy wave",
        spell: "Puppy (thumbs up)",
      },
      {
        id: "learn6",
        target: "pinch",
        holdMs: 2000,
        title: "Pinch thumb and index tips for the duck bill",
        spell: "Duck bill (pinch)",
      },
    ];
  }
  return [
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
}

let lang = "ko";
const langListeners = new Set();

function detectInitialLang() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const q = params?.get("lang");
  if (q === "en" || q === "ko") return q;
  try {
    const s = localStorage.getItem(LS_LANG);
    if (s === "en" || s === "ko") return s;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")) {
    return "en";
  }
  return "ko";
}

export function initI18n() {
  lang = detectInitialLang();
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next !== "en" && next !== "ko") return;
  lang = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
  try {
    localStorage.setItem(LS_LANG, lang);
  } catch {
    /* ignore */
  }
  for (const fn of langListeners) {
    try {
      fn(lang);
    } catch {
      /* ignore */
    }
  }
}

export function onLangChange(fn) {
  langListeners.add(fn);
  return () => langListeners.delete(fn);
}

export function t(key) {
  const table = STR[lang] || STR.ko;
  return table[key] ?? STR.ko[key] ?? key;
}

export function gestureDisplayName(id) {
  return t(`gesture.${id === "none" ? "none" : id}`) || t("gesture.other");
}

export function getChallenges() {
  return challengesFor(lang);
}

export function getLearnSteps() {
  return learnStepsFor(lang);
}

export function applyDomI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const val = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  const titleEl = document.querySelector("title");
  if (titleEl) titleEl.textContent = t("meta.title");
}
