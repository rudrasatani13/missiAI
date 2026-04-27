// ─── Plugins — Consolidated Catch-All Route ───────────────────────────────────
//
// Handles:
//   path=[] (base)       → GET (list), POST (connect), DELETE (disconnect), PATCH (execute)
//   path=["refresh"]     → GET (status), POST (refresh), DELETE (disconnect plugin)

import {
  runPluginsDeleteRoute,
  runPluginsGetRoute,
  runPluginsPatchRoute,
  runPluginsPostRoute,
  runPluginsRefreshDeleteRoute,
  runPluginsRefreshGetRoute,
  runPluginsRefreshPostRoute,
} from "@/lib/server/routes/plugins/runner"

// ─── Base Plugins GET ─────────────────────────────────────────────────────────

async function handlePluginsGet() {
  return runPluginsGetRoute()
}

// ─── Base Plugins POST ────────────────────────────────────────────────────────

async function handlePluginsPost(req: Request) {
  return runPluginsPostRoute(req)
}

// ─── Base Plugins DELETE ──────────────────────────────────────────────────────

async function handlePluginsDelete(req: Request) {
  return runPluginsDeleteRoute(req)
}

// ─── Base Plugins PATCH ───────────────────────────────────────────────────────

async function handlePluginsPatch(req: Request) {
  return runPluginsPatchRoute(req)
}

// ─── Refresh GET ──────────────────────────────────────────────────────────────

async function handleRefreshGet() {
  return runPluginsRefreshGetRoute()
}

// ─── Refresh POST ─────────────────────────────────────────────────────────────

async function handleRefreshPost() {
  return runPluginsRefreshPostRoute()
}

// ─── Refresh DELETE ───────────────────────────────────────────────────────────

async function handleRefreshDelete(req: Request) {
  return runPluginsRefreshDeleteRoute(req)
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsGet()
  if (segment === 'refresh') return handleRefreshGet()
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsPost(req)
  if (segment === 'refresh') return handleRefreshPost()
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsDelete(req)
  if (segment === 'refresh') return handleRefreshDelete(req)
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsPatch(req)
  return Response.json({ error: 'Not found' }, { status: 404 })
}
