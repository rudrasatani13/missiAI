"use client"
import {useRef, useState, useEffect, InputHTMLAttributes} from "react"
import type React from "react"

type InputForm = {
  buttonCopy: {
    idle: string
    success: string
    loading: string
  }
  formAction?: (data: FormData) => Promise<{ success: true } | { success: false; error: string }>
} & Pick<InputHTMLAttributes<HTMLInputElement>, "name" | "type" | "placeholder" | "required">

type State = "idle" | "loading" | "success" | "error"

export function InputForm({ formAction, buttonCopy, ...props }: InputForm) {
  const [state, setState] = useState<State>("idle")
  const [error, setError] = useState<string>()
  const [value, setValue] = useState("")
  const errorTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (state === "success") {
      const resetTimeout = setTimeout(() => {
        setState("idle")
      }, 2000)
      return () => clearTimeout(resetTimeout)
    }
  }, [state])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formEl = e.currentTarget
    if (state === "success" || state === "loading") return

    if (errorTimeout.current) {
      clearTimeout(errorTimeout.current)
      setError(undefined)
      setState("idle")
    }

    if (formAction && typeof formAction === "function") {
      try {
        setState("loading")
        const data = await formAction(new FormData(formEl))

        if (data.success) {
          setState("success")
          formEl.reset()
          setValue("")
        } else {
          setState("error")
          setError(data.error)
          errorTimeout.current = setTimeout(() => {
            setError(undefined)
            setState("idle")
          }, 3000)
        }
      } catch (error) {
        setState("error")
        setError("There was an error while submitting the form")
        console.error(error)
        errorTimeout.current = setTimeout(() => {
          setError(undefined)
          setState("idle")
        }, 3000)
      }
    }
  }

  const inputDisabled = state === "loading"

  return (
    <form className="flex flex-col gap-3 w-full relative" onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 relative">
        <input
          {...props}
          value={value}
          className="flex-1 text-sm px-4 py-3.5 glass-input rounded-xl text-white placeholder:text-gray-400 focus:outline-none transition-all"
          disabled={inputDisabled}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={inputDisabled}
          className="px-6 py-3.5 clean-button rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {state === "loading" ? (
            <div className="flex items-center gap-2">
              {buttonCopy.loading}
              <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            </div>
          ) : state === "success" ? (
            buttonCopy.success
          ) : (
            buttonCopy.idle
          )}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-1 px-1">{error}</p>}
    </form>
  )
}
