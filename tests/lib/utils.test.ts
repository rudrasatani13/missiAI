import { describe, it, expect } from "vitest"
import { cn } from "@/lib/utils"

describe("cn utility", () => {
  it("merges regular strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("foo", true && "bar", false && "baz")).toBe("foo bar")
  })

  it("resolves tailwind class conflicts", () => {
    // twMerge behavior: later classes override earlier classes of the same category
    expect(cn("px-2 py-1 bg-red-500", "p-3 bg-[#b50000]")).toBe("p-3 bg-[#b50000]")
  })

  it("handles falsy values", () => {
    expect(cn("foo", null, undefined, 0, false, "", "bar")).toBe("foo bar")
  })

  it("handles arrays and objects", () => {
    expect(cn("foo", ["bar", "baz"], { qux: true, quux: false })).toBe("foo bar baz qux")
  })
})
