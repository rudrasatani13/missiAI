import { describe, it, expect } from "vitest";
import { isRecord } from "@/lib/utils/is-record";

describe("isRecord", () => {
  it("should return true for an object", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("should return false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("should return false for an array", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("should return false for non-objects", () => {
    expect(isRecord(1)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});
