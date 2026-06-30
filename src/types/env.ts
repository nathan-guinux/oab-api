import type { Context } from "hono";

export interface Env {
  // Vars (from wrangler.jsonc)
  LEITURA_DB_URL: string;
  // Secrets (wrangler secret put / .dev.vars) — never commit to the repo
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

export type AppContext = Context<{ Bindings: Env }>;
