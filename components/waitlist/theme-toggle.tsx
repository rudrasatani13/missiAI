"use client"
import { useState } from "react"

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "system" | "light">("system")

  const themes = [
    { key: "dark", label: "Dark" },
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
  ] as const

  return (
    <div className="flex items-center gap-2 text-xs">
      {themes.map((t, index) => (
        <span key={t.key}>
          <button
            onClick={() => setTheme(t.key)}
            className={`transition-colors ${theme === t.key ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t.label}
          </button>
          {index < themes.length - 1 && <span className="mx-2 text-gray-600">|</span>}
        </span>
      ))}
    </div>
  )
}
