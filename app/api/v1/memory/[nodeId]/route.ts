import { NextRequest } from "next/server"
import {
  runMemoryNodeDeleteRoute,
  runMemoryNodePatchRoute,
} from "@/lib/server/routes/memory/node-runner"

// ─── DELETE — Remove a single node by id ──────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  return runMemoryNodeDeleteRoute(params)
}

// ─── PATCH — Update node detail/tags ──────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  return runMemoryNodePatchRoute(req, params)
}
