import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("merges regular class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("foo", true && "bar", false && "baz")).toBe("foo bar")
  })

  it("handles arrays", () => {
    expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz")
  })

  it("merges tailwind classes correctly", () => {
    // twMerge will resolve conflicts by taking the latter class
    expect(cn("p-4 px-2", "p-8")).toBe("p-8")
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500")
    expect(cn("text-sm", "text-lg")).toBe("text-lg")
  })

  it("handles undefined and null", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar")
  })

  it("merges complex conditional classes", () => {
    expect(
      cn(
        "base-class",
        {
          "conditional-true": true,
          "conditional-false": false,
        },
        "another-class"
      )
    ).toBe("base-class conditional-true another-class")
  })
})
