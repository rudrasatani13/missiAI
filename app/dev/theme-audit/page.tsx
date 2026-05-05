import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { notFound } from "next/navigation"

function ThemePanel({ title, className }: { title: string; className?: string }) {
  return (
    <section className={className}>
      <Card className="border bg-card text-card-foreground">
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Token preview for core controls and states.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="space-y-2">
            <Input placeholder="Input placeholder preview" />
            <Input disabled value="Disabled input preview" readOnly />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
          <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            Muted surface sample for empty/loading/error blocks.
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-sm font-medium text-foreground">Sidebar Active Preview</div>
            <div className="rounded-md border border-sidebar-border bg-sidebar p-2">
              <div className="rounded-md bg-sidebar-active px-2 py-1 text-sm text-sidebar-active-foreground">
                Active item
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export default function ThemeAuditPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <ThemePanel title="Light Tokens" />
        <ThemePanel title="Dark Tokens" className="dark" />
      </div>
    </main>
  )
}
