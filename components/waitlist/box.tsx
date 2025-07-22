import type { PropsWithChildren } from "react"
import Link from "next/link"

export function WaitlistWrapper({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full mx-auto max-w-[500px] flex flex-col justify-center items-center bg-gray-900/50 backdrop-blur-sm pb-0 overflow-hidden rounded-2xl border border-gray-800/50 shadow-2xl">
        <div className="flex flex-col items-center gap-4 flex-1 text-center w-full p-8 pb-4">
          {/* Logo */}
          <div className="flex justify-center w-32 h-auto items-center mx-auto mb-4">
            <Link href="/" className="text-white text-2xl font-bold">
              <span className="text-cyan-400">missi</span>
              <span className="text-coral-400">AI</span>
            </Link>
          </div>

          <div className="flex flex-col gap-10">{children}</div>
        </div>

        <footer className="flex justify-between items-center w-full self-stretch px-8 py-3 text-sm bg-gray-800/30 overflow-hidden">
          <p className="text-xs text-gray-400">© 2024 missiAI. All rights reserved.</p>
          <Link href="/" className="text-xs text-gray-300 hover:text-cyan-400 transition-colors duration-300">
            Back to Home
          </Link>
        </footer>
      </div>
    </div>
  )
}
