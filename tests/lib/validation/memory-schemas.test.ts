import { describe, it, expect } from "vitest"
import { memorySchema } from "@/lib/validation/schemas"

describe("validation schemas", () => {
  describe("memorySchema", () => {
    it("should validate correct memory input", () => {
      const validInput = {
        conversation: [
          { role: "user", content: "Hello, I'm John" },
          { role: "assistant", content: "Nice to meet you John!" },
          { role: "user", content: "I love playing guitar" },
          { role: "assistant", content: "That's a great hobby!" }
        ],
        interactionCount: 5
      }

      const result = memorySchema.safeParse(validInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.conversation).toHaveLength(4)
        expect(result.data.interactionCount).toBe(5)
      }
    })

    it("should default interactionCount to 0", () => {
      const inputWithoutCount = {
        conversation: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" }
        ]
      }

      const result = memorySchema.safeParse(inputWithoutCount)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.interactionCount).toBe(0)
      }
    })

    it("should require at least 2 messages", () => {
      const invalidInput = {
        conversation: [
          { role: "user", content: "Hello" }
        ],
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at least 2 messages")
      }
    })

    it("should reject too many messages", () => {
      const tooManyMessages = Array(51).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`
      }))

      const invalidInput = {
        conversation: tooManyMessages,
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Too many messages")
      }
    })

    it("should validate message roles", () => {
      const invalidInput = {
        conversation: [
          { role: "user", content: "Hello" },
          { role: "invalid_role", content: "Invalid role" }
        ],
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    it("should validate message content length", () => {
      const invalidInput = {
        conversation: [
          { role: "user", content: "" }, // Empty content
          { role: "assistant", content: "Valid response" }
        ],
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot be empty")
      }
    })

    it("should reject too long message content", () => {
      const longContent = "a".repeat(2001)
      const invalidInput = {
        conversation: [
          { role: "user", content: longContent },
          { role: "assistant", content: "Response" }
        ],
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("too long")
      }
    })

    it("should validate interactionCount is non-negative integer", () => {
      const invalidInput = {
        conversation: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" }
        ],
        interactionCount: -1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    it("should validate interactionCount is integer", () => {
      const invalidInput = {
        conversation: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" }
        ],
        interactionCount: 1.5
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    it("should handle missing conversation field", () => {
      const invalidInput = {
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    it("should handle non-array conversation", () => {
      const invalidInput = {
        conversation: "not an array",
        interactionCount: 1
      }

      const result = memorySchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    it("should validate complex valid conversation", () => {
      const validInput = {
        conversation: [
          { role: "user", content: "Hi, I'm planning a trip to Japan" },
          { role: "assistant", content: "That sounds exciting! What cities are you planning to visit?" },
          { role: "user", content: "I want to see Tokyo and Kyoto. I love Japanese culture and food." },
          { role: "assistant", content: "Great choices! Both cities offer amazing cultural experiences and cuisine." },
          { role: "user", content: "My friend Sarah recommended some great restaurants there" },
          { role: "assistant", content: "That's wonderful! Having local recommendations makes the experience even better." }
        ],
        interactionCount: 15
      }

      const result = memorySchema.safeParse(validInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.conversation).toHaveLength(6)
        expect(result.data.interactionCount).toBe(15)
        expect(result.data.conversation[0].role).toBe("user")
        expect(result.data.conversation[1].role).toBe("assistant")
      }
    })
  })
})