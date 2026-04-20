1. **Analyze the N+1 problem**
   The webhook receives `messages` array inside a payload and iterates through them:
   ```typescript
   for (const message of messages) {
       // ...
       const isDup = await isMessageDuplicate(kv, 'whatsapp', messageId)
       // ...
       await markMessageProcessed(kv, 'whatsapp', messageId)
       // ...
       const userId = await resolveClerkUserFromPhone(kv, senderPhone)
       // ...
       const { allowed: limitAllowed } = await checkAndIncrementBotDailyLimit(...)
   }
   ```
   All these calls happen sequentially inside the loop (`N * M` await calls).

2. **Refactor using Promise.all**
   Most of the webhooks payload for WhatsApp contains just a single message (`messages.length === 1`), but batching can happen in some circumstances.
   We can process each message concurrently if they are isolated from each other.
   We can rewrite `for (const message of messages)` to use `await Promise.all(messages.map(async (message) => { ... }))`.

   However, we need to be careful with rate limits and processing dependencies. Since `messages` usually contain independent messages from a user, we can handle them concurrently using `Promise.all`.

   Another optimization is checking all duplicates in bulk if `isMessageDuplicate` supports it, but Cloudflare KV's `get` doesn't have a bulk API, so the best we can do is `Promise.all` on our end.
   We will refactor the sequential loop `for (const message of messages)` into an array of promises running via `await Promise.all(messages.map(async (message) => { ... }))`.

   Wait, let's verify if `Promise.all` on `messages` is sufficient. The task explicitly says "It can be solved by batching KV reads or utilizing `Promise.all` but requires ensuring dependencies between checks are maintained."

   Let's check the dependencies. `markMessageProcessed` should only be called if `isDup` is false.
   If we change the loop to:
   ```typescript
   await Promise.all(messages.map(async (message) => {
       // same logic inside
   }))
   ```
   Will there be any issues? If multiple messages in the same payload have the same `messageId` (not likely), it could be an issue. But `message.id` is unique per message.

   Let's create the plan.
