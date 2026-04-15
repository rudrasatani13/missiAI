import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { AgentDashboard } from "@/components/agents/AgentDashboard"

export default async function AgentsPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 text-neutral-100">
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-8 mt-16 md:mt-20">
        <header>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            Agent Actions
          </h1>
          <p className="text-neutral-400 mt-2">
            Assign multi-step tasks to Missi. Tell her what to do, review the plan, and watch it run.
          </p>
        </header>

        <AgentDashboard />
      </main>
    </div>
  )
}
