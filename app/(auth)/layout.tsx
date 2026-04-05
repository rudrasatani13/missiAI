"use client"

import { useEffect } from "react"

/**
 * Auth layout — overrides the root layout's monospace font,
 * hides the custom cursor and global footer on auth pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Override the body font for auth pages
  useEffect(() => {
    const body = document.body
    const prev = body.style.fontFamily
    body.style.fontFamily =
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    body.classList.add("auth-page")
    return () => {
      body.style.fontFamily = prev
      body.classList.remove("auth-page")
    }
  }, [])

  return <>{children}</>
}
