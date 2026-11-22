# Session Keys in the Browser Preview are relayed through the server

The AI pipeline runs in the server route `/api/chat`, so a Session Key typed into the Browser Preview travels with each request through nex-note.com to the chosen provider instead of going from the browser straight to the provider. Porting the pipeline into the browser would have kept the key off the server but meant a large rewrite; we accept the relay on condition that the server keeps the key and the score only in memory for the request, never logs them or echoes them in errors, rate-limits the route, and that the page and privacy policy say so plainly.

## Consequences

The public AI gate in `lib/public-ai-access.ts` opens on public hosts only for requests that carry a Session Key, and only for cloud providers; Ollama stays desktop-only.
