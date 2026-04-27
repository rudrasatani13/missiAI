"use client"

import { useCallback, useEffect, useState, type MutableRefObject } from "react"
import { formatMemoryNodesForChat, getAvatarFetchDelayMs } from "@/lib/chat/page-lifecycle"
import type { AvatarTier } from "@/types/gamification"

interface MemoryResponseNode {
  category: string
  title: string
  detail: string
}

interface UseChatHydrationOptions {
  isFullDevBootstrap: boolean
  isLoaded: boolean
  memoriesRef: MutableRefObject<string>
  userId: string | undefined
}

export function useChatHydration(options: UseChatHydrationOptions) {
  const { isFullDevBootstrap, isLoaded, memoriesRef, userId } = options
  const [avatarTier, setAvatarTier] = useState<AvatarTier>(1)
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

  useEffect(() => {
    if (!isLoaded || !userId) return

    let cancelled = false
    const loadAvatarTier = () => {
      fetch("/api/v1/streak")
        .then((response) => response.json())
        .then((data) => {
          if (cancelled) return
          if (data?.success && data.data) {
            setAvatarTier(data.data.avatarTier ?? 1)
          }
        })
        .catch((error) => {
          console.error("[ChatHydration] Failed to load avatar tier", error)
        })
    }

    const delayMs = getAvatarFetchDelayMs(isFullDevBootstrap)
    if (delayMs === 0) {
      loadAvatarTier()
    } else {
      const timer = setTimeout(loadAvatarTier, delayMs)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    return () => {
      cancelled = true
    }
  }, [isFullDevBootstrap, isLoaded, userId])

  return {
    avatarTier,
    fetchMemories,
    memoriesState,
  }
}
