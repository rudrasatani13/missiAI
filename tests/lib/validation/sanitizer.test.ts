import { describe, it, expect } from "vitest"
import { escapeSql } from "@/lib/validation/sanitizer"

describe("sanitizer", () => {
  describe("escapeSql", () => {
    it("should handle empty strings", () => {
      expect(escapeSql("")).toBe("")
    })

    it("should return identical string if no special characters exist", () => {
      expect(escapeSql("hello world")).toBe("hello world")
      expect(escapeSql("12345")).toBe("12345")
      expect(escapeSql("safe_string")).toBe("safe_string")
    })

    it("should escape single quotes", () => {
      expect(escapeSql("'")).toBe("\\'")
      expect(escapeSql("O'Connor")).toBe("O\\'Connor")
      expect(escapeSql("''")).toBe("\\'\\'")
    })

    it("should escape double quotes", () => {
      expect(escapeSql("\"")).toBe("\\\"")
      expect(escapeSql("He said \"hello\"")).toBe("He said \\\"hello\\\"")
    })

    it("should escape backslashes", () => {
      expect(escapeSql("\\")).toBe("\\\\")
      expect(escapeSql("C:\\Windows\\System32")).toBe("C:\\\\Windows\\\\System32")
    })

    it("should escape null character (\\0)", () => {
      expect(escapeSql("\0")).toBe("\\0")
      expect(escapeSql("null\0char")).toBe("null\\0char")
    })

    it("should escape backspace (\\x08)", () => {
      expect(escapeSql("\x08")).toBe("\\b")
      expect(escapeSql("back\x08space")).toBe("back\\bspace")
    })

    it("should escape tab (\\x09)", () => {
      expect(escapeSql("\x09")).toBe("\\t")
      expect(escapeSql("tab\x09char")).toBe("tab\\tchar")
    })

    it("should escape substitute/ctrl-z (\\x1a)", () => {
      expect(escapeSql("\x1a")).toBe("\\z")
      expect(escapeSql("sub\x1achar")).toBe("sub\\zchar")
    })

    it("should escape newline (\\n)", () => {
      expect(escapeSql("\n")).toBe("\\n")
      expect(escapeSql("new\nline")).toBe("new\\nline")
    })

    it("should escape carriage return (\\r)", () => {
      expect(escapeSql("\r")).toBe("\\r")
      expect(escapeSql("carriage\rreturn")).toBe("carriage\\rreturn")
    })

    it("should handle combinations of special characters", () => {
      expect(escapeSql("O'Connor said \"hello\\world\" \n\r")).toBe("O\\'Connor said \\\"hello\\\\world\\\" \\n\\r")
    })

    it("should handle SQL injection attempts", () => {
      expect(escapeSql("admin' OR '1'='1")).toBe("admin\\' OR \\'1\\'=\\'1")
      expect(escapeSql("'; DROP TABLE users; --")).toBe("\\'; DROP TABLE users; --")
    })
  })
})
