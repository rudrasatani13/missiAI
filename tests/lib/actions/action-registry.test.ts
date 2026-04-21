import { describe, it, expect } from "vitest"
import {
  ACTION_DESCRIPTIONS,
  getActionLabel,
  ACTION_TRIGGERS,
} from "@/lib/actions/action-registry"
import type { ActionType } from "@/types/actions"

const ALL_ACTION_TYPES: Exclude<ActionType, "none">[] = [
  "web_search",
  "draft_email",
  "draft_message",
  "set_reminder",
  "take_note",
  "calculate",
  "translate",
  "summarize",
]

describe("action-registry", () => {
  describe("ACTION_DESCRIPTIONS", () => {
    it("should have an entry for all 8 action types (not none)", () => {
      for (const type of ALL_ACTION_TYPES) {
        expect(ACTION_DESCRIPTIONS).toHaveProperty(type)
        expect(typeof ACTION_DESCRIPTIONS[type]).toBe("string")
        expect(ACTION_DESCRIPTIONS[type].length).toBeGreaterThan(0)
      }
    })

    it("should not have an entry for none", () => {
      expect(ACTION_DESCRIPTIONS).not.toHaveProperty("none")
    })
  })

  describe("getActionLabel", () => {
    it('should return "Web Search" for web_search', () => {
      expect(getActionLabel("web_search")).toBe("Web Search")
    })

    it('should return "Draft Email" for draft_email', () => {
      expect(getActionLabel("draft_email")).toBe("Draft Email")
    })

    it('should return "Draft Message" for draft_message', () => {
      expect(getActionLabel("draft_message")).toBe("Draft Message")
    })

    it('should return "Set Reminder" for set_reminder', () => {
      expect(getActionLabel("set_reminder")).toBe("Set Reminder")
    })

    it('should return "Take Note" for take_note', () => {
      expect(getActionLabel("take_note")).toBe("Take Note")
    })

    it('should return "Calculate" for calculate', () => {
      expect(getActionLabel("calculate")).toBe("Calculate")
    })

    it('should return "Translate" for translate', () => {
      expect(getActionLabel("translate")).toBe("Translate")
    })

    it('should return "Summarize" for summarize', () => {
      expect(getActionLabel("summarize")).toBe("Summarize")
    })

    it('should return "None" for none', () => {
      expect(getActionLabel("none")).toBe("None")
    })
  })

  describe("ACTION_TRIGGERS", () => {
    it("should have entries for all 8 action types", () => {
      for (const type of ALL_ACTION_TYPES) {
        expect(ACTION_TRIGGERS).toHaveProperty(type)
        expect(Array.isArray(ACTION_TRIGGERS[type])).toBe(true)
        expect(ACTION_TRIGGERS[type].length).toBeGreaterThan(0)
      }
    })

    it('should have "remind me" in set_reminder triggers', () => {
      expect(ACTION_TRIGGERS.set_reminder).toContain("remind me")
    })

    it('should have "search" in web_search triggers', () => {
      expect(ACTION_TRIGGERS.web_search).toContain("search")
    })

    it('should have "translate" in translate triggers', () => {
      expect(ACTION_TRIGGERS.translate).toContain("translate")
    })

    it('should have "email" in draft_email triggers', () => {
      expect(ACTION_TRIGGERS.draft_email).toContain("email")
    })

    it('should have "note this" in take_note triggers', () => {
      expect(ACTION_TRIGGERS.take_note).toContain("note this")
    })

    it('should have "calculate" in calculate triggers', () => {
      expect(ACTION_TRIGGERS.calculate).toContain("calculate")
    })

    it('should have "summarize" in summarize triggers', () => {
      expect(ACTION_TRIGGERS.summarize).toContain("summarize")
    })
  })
})
