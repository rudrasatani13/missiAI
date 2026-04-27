import { beforeEach, describe, expect, it, vi } from "vitest"

const { getCloudflareD1BindingMock } = vi.hoisted(() => ({
  getCloudflareD1BindingMock: vi.fn(),
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareD1Binding: getCloudflareD1BindingMock,
}))

import {
  createTransactionalRepositoryContext,
  getTransactionalRepositoryDescriptor,
  listTransactionalRepositoryDescriptors,
  requireTransactionalRepositoryContext,
} from "@/lib/server/data/transactional-repository"

function makeDb() {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  }
}

describe("transactional-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists the planned transactional repository descriptors", () => {
    const descriptors = listTransactionalRepositoryDescriptors()

    expect(descriptors.map((descriptor) => descriptor.domain)).toEqual([
      "mood",
      "gamification",
      "spaces",
      "analytics",
    ])
    expect(getTransactionalRepositoryDescriptor("spaces")).toEqual({
      domain: "spaces",
      authority: "d1",
      rolloutTrack: "phase4_track_c",
      tables: ["spaces", "space_members", "space_invites", "space_graph_versions"],
    })
  })

  it("creates a repository context from the configured D1 binding", () => {
    const db = makeDb()
    getCloudflareD1BindingMock.mockReturnValueOnce(db)

    const context = createTransactionalRepositoryContext("mood")

    expect(context).toEqual({
      domain: "mood",
      descriptor: {
        domain: "mood",
        authority: "d1",
        rolloutTrack: "phase4_track_b",
        tables: ["mood_entries", "mood_insights"],
      },
      db,
      now: expect.any(Function),
    })
  })

  it("returns null when no transactional binding is available", () => {
    getCloudflareD1BindingMock.mockReturnValueOnce(null)

    expect(createTransactionalRepositoryContext("analytics")).toBeNull()
  })

  it("allows explicit db injection and custom clock", () => {
    const db = makeDb()
    const now = vi.fn(() => 123456)

    const context = createTransactionalRepositoryContext("gamification", { db, now })

    expect(context?.db).toBe(db)
    expect(context?.now()).toBe(123456)
    expect(now).toHaveBeenCalledTimes(1)
  })

  it("throws when a required transactional context cannot be created", () => {
    getCloudflareD1BindingMock.mockReturnValueOnce(null)

    expect(() => requireTransactionalRepositoryContext("spaces")).toThrow(
      'Transactional repository binding is unavailable for domain "spaces"',
    )
  })
})
