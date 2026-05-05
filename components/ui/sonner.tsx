"use client"

import * as React from "react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = React.useState<"light" | "dark">("light")

  React.useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => {
      const isDark =
        root.classList.contains("dark") ||
        root.getAttribute("data-theme") === "dark"
      setTheme(isDark ? "dark" : "light")
    }

    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
