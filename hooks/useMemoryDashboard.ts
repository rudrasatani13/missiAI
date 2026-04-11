'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { LifeGraph, LifeNode, MemoryCategory } from '@/types/memory'

export function useMemoryDashboard(ready: boolean = true) {
  const [graph, setGraph] = useState<LifeGraph | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchGraph = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/memory')
      // 401 means Clerk session not ready yet — show empty state, not error
      if (res.status === 401) {
        setGraph({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 } as LifeGraph)
        return
      }
      const data = await res.json()
      if (data.success) {
        setGraph(data.data)
      } else {
        setError(data.error ?? 'Failed to load memories')
      }
    } catch {
      setError('Failed to load memories')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready) fetchGraph()
  }, [fetchGraph, ready])

  const filteredNodes = useMemo((): LifeNode[] => {
    if (!graph) return []
    let nodes = [...graph.nodes]
    if (selectedCategory !== 'all') {
      nodes = nodes.filter((n) => n.category === selectedCategory)
    }
    const trimmed = searchQuery.trim()
    if (trimmed.length >= 2) {
      const lower = trimmed.toLowerCase()
      nodes = nodes.filter(
        (n) =>
          n.title.toLowerCase().includes(lower) ||
          n.detail.toLowerCase().includes(lower) ||
          n.tags.some((t) => t.toLowerCase().includes(lower)),
      )
    }
    return nodes.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [graph, selectedCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts: Record<MemoryCategory | 'all', number> = {
      all: 0,
      person: 0,
      goal: 0,
      habit: 0,
      preference: 0,
      event: 0,
      emotion: 0,
      skill: 0,
      place: 0,
      belief: 0,
      relationship: 0,
    }
    if (!graph) return counts
    for (const node of graph.nodes) {
      counts[node.category] = (counts[node.category] ?? 0) + 1
      counts.all++
    }
    return counts
  }, [graph])

  const stats = useMemo(() => {
    const empty = {
      totalNodes: 0,
      totalInteractions: graph?.totalInteractions ?? 0,
      mostAccessedNode: null as LifeNode | null,
      newestNode: null as LifeNode | null,
      topCategory: null as MemoryCategory | null,
    }
    if (!graph || graph.nodes.length === 0) return empty

    const totalNodes = graph.nodes.length
    const totalInteractions = graph.totalInteractions

    const mostAccessedNode = graph.nodes.reduce((a, b) =>
      a.accessCount > b.accessCount ? a : b,
    )
    const newestNode = graph.nodes.reduce((a, b) =>
      a.createdAt > b.createdAt ? a : b,
    )

    const catCounts: Partial<Record<MemoryCategory, number>> = {}
    for (const node of graph.nodes) {
      catCounts[node.category] = (catCounts[node.category] ?? 0) + 1
    }

    let topCategory: MemoryCategory | null = null
    let maxCount = 0
    for (const [cat, count] of Object.entries(catCounts) as [MemoryCategory, number][]) {
      if (count > maxCount) {
        maxCount = count
        topCategory = cat
      }
    }

    return { totalNodes, totalInteractions, mostAccessedNode, newestNode, topCategory }
  }, [graph])

  const deleteNode = useCallback(async (nodeId: string): Promise<void> => {
    setDeletingId(nodeId)
    setError(null) // Clear any previous error
    try {
      const res = await fetch(`/api/v1/memory/${nodeId}`, { method: 'DELETE' })
      if (res.ok) {
        // Optimistic update — remove from local state immediately
        setGraph((prev) =>
          prev ? { ...prev, nodes: prev.nodes.filter((n) => n.id !== nodeId) } : prev,
        )
      } else {
        // Try to parse JSON error; if the response is HTML (500 crash), catch it
        let errorMsg = 'Failed to delete memory'
        try {
          const contentType = res.headers.get('content-type') ?? ''
          if (contentType.includes('application/json')) {
            const data = await res.json()
            if (data.error) errorMsg = data.error
          } else {
            errorMsg = `Server error (${res.status}). Please try again.`
          }
        } catch {
          errorMsg = `Server error (${res.status}). Please try again.`
        }
        setError(errorMsg)
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setDeletingId(null)
    }
  }, [])

  const updateSearch = useCallback((query: string): void => {
    setSearchQuery(query)
  }, [])

  const updateCategory = useCallback((cat: MemoryCategory | 'all'): void => {
    setSelectedCategory(cat)
  }, [])

  const refreshGraph = useCallback(async (): Promise<void> => {
    await fetchGraph()
  }, [fetchGraph])

  return {
    graph,
    isLoading,
    error,
    selectedCategory,
    searchQuery,
    deletingId,
    filteredNodes,
    categoryCounts,
    stats,
    deleteNode,
    updateSearch,
    updateCategory,
    refreshGraph,
  }
}
