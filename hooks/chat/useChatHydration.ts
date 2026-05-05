"use client"

import { useCallback, useEffect, useState, type MutableRefObject } from "react"
import { formatMemoryNodesForChat } from "@/lib/chat/page-lifecycle"

interface MemoryResponseNode {
  category: string
  title: string
  detail: string
}

interface UseChatHydrationOptions {
  isLoaded: boolean
  memoriesRef: MutableRefObject<string>
  userId: string | undefined
}

export function useChatHydration(options: UseChatHydrationOptions) {
  const { isLoaded, memoriesRef, userId } = options
  const [memoriesState, setMemoriesState] = useState("")

  const fetchMemories = useCallback(async () => {
    try {
      const data = await fetch("/api/v1/memory").then((response) => response.json()) as {
        data?: { nodes?: MemoryResponseNode[] }
      }
      const nodes = data.data?.nodes ?? []
      if (nodes.length > 0) {
        const mem = formatMemoryNodesForChat(nodes)
        memoriesRef.current = mem
        setMemoriesState(mem)
      }
    } catch (error) {
      console.error("[ChatHydration] Failed to load memory context", error)
    }
  }, [memoriesRef])

  useEffect(() => {
    if (!isLoaded || !userId) return
    fetchMemories()
  }, [isLoaded, userId, fetchMemories])

  return {
    fetchMemories,
    memoriesState,
  }
}
