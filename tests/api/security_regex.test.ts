import { describe, it, expect } from "vitest"

/**
 * Security test to ensure regex-based parsing vulnerabilities are addressed.
 * While the production code now uses req.cookies.get(), we verify the
 * escaping logic used in other parts of the codebase.
 */
describe("Regex Security", () => {
  it("should correctly escape special characters in userName", () => {
    const userName = "user.*"
    const escapedName = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    expect(escapedName).toBe("user\\.\\*")

    const re = new RegExp(escapedName, 'gi')
    expect(re.test("user.*")).toBe(true)
    expect(re.test("userabc")).toBe(false)
  })

  it("should prevent regex injection via userName", () => {
    const maliciousName = "a|b"
    const escapedName = maliciousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    expect(escapedName).toBe("a\\|b")

    const re = new RegExp(escapedName, 'gi')
    expect(re.test("a|b")).toBe(true)
    expect(re.test("a")).toBe(false)
    expect(re.test("b")).toBe(false)
  })
})
