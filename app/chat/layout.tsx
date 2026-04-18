/**
 * Chat layout — authentication is handled by the Clerk middleware
 * (middleware.ts → auth.protect() for all non-public routes).
 *
 * The setup-completion check was moved client-side into the chat page
 * (via Clerk's useUser().publicMetadata) so that this layout doesn't
 * need auth() / getCloudflareContext(), which would force `runtime = 'edge'`
 * and bundle ~2 MB of client-side deps into the edge function.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
