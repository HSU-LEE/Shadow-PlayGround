import { describe, it, expect } from "vitest";
import { detectPrimaryGesture, countExtendedFingers } from "../public/js/gestures.js";

describe("detectPrimaryGesture", () => {
  it("returns null for invalid input", () => {
    expect(detectPrimaryGesture(null)).toBeNull();
    expect(detectPrimaryGesture(undefined)).toBeNull();
    expect(detectPrimaryGesture([])).toBeNull();
    expect(detectPrimaryGesture([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("countExtendedFingers", () => {
  it("returns 0 for invalid input", () => {
    expect(countExtendedFingers(null)).toBe(0);
    expect(countExtendedFingers([])).toBe(0);
  });
});
