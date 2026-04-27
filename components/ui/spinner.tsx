"use client"

import { cn } from "@/lib/ui/utils"

export interface SpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "w-4 h-4 border-[1.5px]",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-2",
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      data-testid="spinner"
      className={cn(
        "animate-spin rounded-full border-white/20 border-t-white/70",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}
