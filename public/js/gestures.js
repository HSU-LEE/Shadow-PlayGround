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

export function countExtendedFingers(lm) {
  if (!lm || lm.length < 21) return 0;
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

export function detectPrimaryGesture(lm) {
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
