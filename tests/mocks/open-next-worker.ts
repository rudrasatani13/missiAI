// Mock for the OpenNext build-generated worker bundle.
// This file is used during tests to prevent vitest from throwing an
// ERR_MODULE_NOT_FOUND error when it tries to import the missing build artifact.

import { vi } from "vitest"

export const openNextFetchMock = vi.fn()

export default {
  fetch: openNextFetchMock,
}

export class DOQueueHandler {
  constructor() {}
}

export class DOShardedTagCache {
  constructor() {}
}

export class BucketCachePurge {
  constructor() {}
}
