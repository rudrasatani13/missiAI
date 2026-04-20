import { describe, it, expect, vi, beforeEach } from "vitest"
import { extractMemories } from "@/services/memory.service"
import { callAIDirect } from "@/services/ai.service"
import type { Message } from "@/types"

vi.mock("@/services/ai.service", () => ({
  callAIDirect: vi.fn(),
}))

describe("memory.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("extractMemories", () => {
    it("should extract new facts and merge with existing ones", async () => {
      const mockConversation: Message[] = [
        { role: "user", content: "I just started learning TypeScript." },
        { role: "assistant", content: "That's great! It's a useful language." },
      ]

      const existingMemories = "- User is learning JavaScript."
      const mockAIResponse = "- User is learning JavaScript.\n- User just started learning TypeScript."

      vi.mocked(callAIDirect).mockResolvedValueOnce(mockAIResponse)

      const result = await extractMemories(mockConversation, existingMemories)

      expect(callAIDirect).toHaveBeenCalledTimes(1)
      const callArgs = vi.mocked(callAIDirect).mock.calls[0]
      expect(callArgs[0]).toContain("You are a memory extraction system")
      expect(callArgs[1]).toContain(existingMemories)
      expect(callArgs[1]).toContain("user: I just started learning TypeScript.")

      expect(result).toBe(mockAIResponse)
    })

    it("should handle empty existing memories", async () => {
      const mockConversation: Message[] = [
        { role: "user", content: "My name is John." }
      ]

      const mockAIResponse = "- User's name is John."
      vi.mocked(callAIDirect).mockResolvedValueOnce(mockAIResponse)

      const result = await extractMemories(mockConversation, "")

      expect(callAIDirect).toHaveBeenCalledTimes(1)
      const callArgs = vi.mocked(callAIDirect).mock.calls[0]
      expect(callArgs[1]).toContain("None yet.")
      expect(callArgs[1]).toContain("user: My name is John.")

      expect(result).toBe(mockAIResponse)
    })

    it("should return existing memories if AI returns empty or whitespace", async () => {
      const mockConversation: Message[] = [
        { role: "user", content: "Hello" }
      ]
      const existingMemories = "- User likes coffee."

      vi.mocked(callAIDirect).mockResolvedValueOnce("   \n  ")

      const result = await extractMemories(mockConversation, existingMemories)

      expect(result).toBe(existingMemories)
    })

    it("should return existing memories if AI returns empty string", async () => {
      const mockConversation: Message[] = [
        { role: "user", content: "Hello" }
      ]
      const existingMemories = "- User likes tea."

      vi.mocked(callAIDirect).mockResolvedValueOnce("")

      const result = await extractMemories(mockConversation, existingMemories)

      expect(result).toBe(existingMemories)
    })
  })
})
