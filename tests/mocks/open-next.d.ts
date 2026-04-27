declare module "*/.open-next/worker.js" {
  const openNextWorker: {
    fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>
  }
  export default openNextWorker

  export class DOQueueHandler {
    constructor(state: unknown, env: unknown)
  }
  export class DOShardedTagCache {
    constructor(state: unknown, env: unknown)
  }
  export class BucketCachePurge {
    constructor(state: unknown, env: unknown)
  }
}
