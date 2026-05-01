import { afterEach, describe, expect, it, vi } from "vitest"

describe("vertex-auth", () => {
  afterEach(() => {
    delete process.env.VERTEX_AI_PROJECT_ID
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    vi.resetModules()
  })

  it("returns VERTEX_AI_PROJECT_ID when it is explicitly configured", async () => {
    process.env.VERTEX_AI_PROJECT_ID = "explicit-project"
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "service-account-project" })

    const { getVertexProjectId } = await import("@/lib/ai/providers/vertex-auth")

    expect(getVertexProjectId()).toBe("explicit-project")
  })

  it("falls back to the service account project_id when VERTEX_AI_PROJECT_ID is missing", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "service-account-project" })

    const { getVertexProjectId } = await import("@/lib/ai/providers/vertex-auth")

    expect(getVertexProjectId()).toBe("service-account-project")
  })

  it("throws when neither VERTEX_AI_PROJECT_ID nor service account project_id is available", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "missi@example.com" })

    const { getVertexProjectId } = await import("@/lib/ai/providers/vertex-auth")

    expect(() => getVertexProjectId()).toThrow(
      "Missing Vertex AI project configuration. Set VERTEX_AI_PROJECT_ID or provide GOOGLE_SERVICE_ACCOUNT_JSON with project_id.",
    )
  })
})
