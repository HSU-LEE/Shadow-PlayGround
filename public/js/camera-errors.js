/** @param {unknown} err */
export function classifyCameraError(err) {
  const name =
    err && typeof err === "object" && "name" in err && typeof err.name === "string"
      ? err.name
      : "";
  const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err ?? "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "no_device";
  if (name === "NotReadableError" || name === "TrackStartError") return "in_use";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return "constraint";
  if (name === "SecurityError") return "insecure";
  if (typeof location !== "undefined" && location.protocol !== "https:" && location.hostname !== "localhost") {
    return "insecure";
  }
  if (/insecure|https|SSL/i.test(msg)) return "insecure";
  if (/Permission|denied|NotAllowed/i.test(msg)) return "denied";
  if (/NotFound|no device|Could not start/i.test(msg)) return "no_device";
  return "unknown";
}

/** @param {(k: string) => string} t */
export function messageForCameraCode(code, t) {
  const key = `camera.${code}`;
  const s = t(key);
  return s === key ? t("camera.unknown") : s;
}
