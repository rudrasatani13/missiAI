import { SignUp } from "@clerk/nextjs"

export const runtime = "edge"
export const dynamic = "force-dynamic"

export default function SignUpPage() {
  return (
    <div 
      className="min-h-screen bg-black flex items-center justify-center px-4"
      data-testid="sign-up-page"
    >
      <SignUp 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-black/80 border border-white/10 shadow-2xl",
            headerTitle: "text-white",
            headerSubtitle: "text-white/50",
            socialButtonsBlockButton: "bg-white/5 border-white/10 text-white hover:bg-white/10",
            formFieldLabel: "text-white/70",
            formFieldInput: "bg-white/5 border-white/10 text-white placeholder:text-white/30",
            footerActionLink: "text-white/60 hover:text-white",
            formButtonPrimary: "bg-white text-black hover:bg-white/90",
          },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/chat"
      />
    </div>
  )
}
