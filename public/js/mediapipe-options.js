/**
 * MediaPipe Hands options — tune here only.
 * @param {{ performanceMode?: boolean }} [opts]
 */
export function getMediaPipeHandsOptions(opts = {}) {
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const hq = params?.get("hq") === "1";
  const perf = Boolean(opts.performanceMode);
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2;
  let modelComplexity = hq && cores >= 4 ? 2 : 1;
  if (perf && modelComplexity > 1) modelComplexity = 1;

  return {
    maxNumHands: 1,
    modelComplexity,
    minDetectionConfidence: perf ? 0.62 : 0.65,
    minTrackingConfidence: perf ? 0.64 : 0.68,
  };
}
