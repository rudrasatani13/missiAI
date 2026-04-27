"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import {
  dataUrlToJpegFile,
  getVisualMemoryErrorMessage,
  normalizeVisualMemoryResult,
  type VisualMemoryResult,
  VISUAL_MEMORY_ANALYZE_ENDPOINT,
  VISUAL_MEMORY_RESULT_TIMEOUT_MS,
} from "@/lib/chat/visual-memory"

interface UseVisualMemoryCaptureOptions {
  onSaveSuccess?: (() => Promise<void>) | (() => void)
}

export function useVisualMemoryCapture(options: UseVisualMemoryCaptureOptions = {}) {
  const { onSaveSuccess } = options
  const imagePayloadRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [visualNote, setVisualNote] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [visualResult, setVisualResult] = useState<VisualMemoryResult | null>(null)
  const visualResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissVisualResult = useCallback(() => {
    setVisualResult(null)
  }, [])

  const clearVisualSelection = useCallback(() => {
    setThumbnail(null)
    imagePayloadRef.current = null
    setVisualNote("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const handleImageConsumed = useCallback(() => {
    setThumbnail(null)
  }, [])

  const scheduleVisualResultDismiss = useCallback(() => {
    if (visualResultTimerRef.current) {
      clearTimeout(visualResultTimerRef.current)
    }
    visualResultTimerRef.current = setTimeout(() => setVisualResult(null), VISUAL_MEMORY_RESULT_TIMEOUT_MS)
  }, [])

  const handleSaveToMemory = useCallback(async () => {
    if (!thumbnail || !imagePayloadRef.current || isAnalyzing) return

    const compressedFile = dataUrlToJpegFile(imagePayloadRef.current)

    setIsAnalyzing(true)
    setVisualResult(null)

    const formData = new FormData()
    formData.append("file", compressedFile)
    if (visualNote.trim()) {
      formData.append("note", visualNote.trim().slice(0, 200))
    }

    try {
      const res = await fetch(VISUAL_MEMORY_ANALYZE_ENDPOINT, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        setVisualResult({
          title: getVisualMemoryErrorMessage(res.status, data),
          recallHint: "",
          tags: [],
        })
      } else {
        setVisualResult(normalizeVisualMemoryResult(data))
        clearVisualSelection()
        await Promise.resolve(onSaveSuccess?.()).catch((error) => {
          console.error("[VisualMemoryCapture] onSaveSuccess callback failed", error)
        })
      }
    } catch (error) {
      console.error("[VisualMemoryCapture] Failed to analyze visual memory", error)
      setVisualResult({ title: "Couldn't save that image. Please try again.", recallHint: "", tags: [] })
    } finally {
      setIsAnalyzing(false)
      scheduleVisualResultDismiss()
    }
  }, [thumbnail, isAnalyzing, visualNote, clearVisualSelection, onSaveSuccess, scheduleVisualResultDismiss])

  const handleImageSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement("canvas")
      let width = img.width
      let height = img.height
      const maxSize = 1024

      if (width > height && width > maxSize) {
        height = Math.round(height * maxSize / width)
        width = maxSize
      } else if (height > maxSize) {
        width = Math.round(width * maxSize / height)
        height = maxSize
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(img, 0, 0, width, height)

      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85)
      imagePayloadRef.current = compressedBase64
      setThumbnail(compressedBase64)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      console.error("Failed to load image for compression")
    }

    img.src = objectUrl
  }, [])

  useEffect(() => {
    return () => {
      if (visualResultTimerRef.current) {
        clearTimeout(visualResultTimerRef.current)
      }
    }
  }, [])

  return {
    clearVisualSelection,
    dismissVisualResult,
    fileInputRef,
    handleImageConsumed,
    handleImageSelect,
    handleSaveToMemory,
    imagePayloadRef,
    isAnalyzing,
    setVisualNote,
    thumbnail,
    visualNote,
    visualResult,
  }
}
