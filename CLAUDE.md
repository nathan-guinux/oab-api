# OAB API — Rules for Claude

OAB-PR's central data API. A standalone **Cloudflare Worker**, written in **TypeScript**
with **Hono + cloudflare/chanfana + Zod**, whose sole job is to **read OAB's legacy database
through the `leitura-db` gateway** and expose it as a clean, versioned API for the **other systems**
(`oab-portal`, `oab-esa`, etc.).

> This worker **replaces `api.oabpr.org.br/v3`** (the "lawyer v3"). Consumer apps no longer
> talk to the third-party API — they talk to this worker, keeping **the same contract**.

## Goal (the big idea)

- Today the systems depend on **`api.oabpr.org.br/v3`** (a third-party API) that reads SQL Server.
- We will **reimplement that API as our own Worker**, reading `DBOAB`/`OAB_DW`/`DBIMG` through the
  `leitura-db` gateway — instead of calling third parties, and **never gluing SQL directly to the database**.
- **Centralizes**: the SQL and the service token live **only here**. Consumer apps just swap the base
  URL; the response JSON stays the same.
- It's the piece of the **strangler** migration (replacing the legacy system module by module, no big-bang).

## What this worker is NOT

- It is **not** `oab-sso` — person authentication (the `sso_token` cookie) still belongs to it. This
  worker is **data only**. (Decision: a **separate** worker, outside `oab-sso`.)
- It has **no** UI/pages. It's a pure API (hence a pure Worker, not Next/OpenNext).
- It does **not** write to the legacy system **in the current phase** (read-only). Writes come later, via a
  **dedicated write gateway** (separate from `leitura-db`), least-privilege — see "Writes (future)".

## Stack

- **Runtime:** Cloudflare Workers (V8 isolate). NestJS does **not** run here (it needs full Node);
  that's why Hono.
- **Framework:** [Hono](https://hono.dev) + [`cloudflare/chanfana`](https://github.com/cloudflare/chanfana)
  — **class-based** endpoints (controller style) with **Zod** validation and **auto-generated
  OpenAPI/Swagger** (important: other systems consume this API).
- **Language:** TypeScript, always.
- **Package manager:** **yarn**, exclusively. Never `npm`/`pnpm`.
- **Own data (when needed):** D1 (SQL), KV (cache/rate-limit), R2 (files) — same
  pattern as `oab-portal`.

## How the data flows

```
oab-portal / oab-esa / others          ← consumer apps (swap only the base URL)
        │  HTTPS (same contract as v3)
        ▼
oab-api  (THIS worker)                  ← builds the SQL, holds the service token
        │  POST /query  + headers CF-Access-Client-Id / CF-Access-Client-Secret
        ▼
leitura-db.oabpr.org.br                 ← read-only gateway (Access → Tunnel → Node adapter → SQL)
        │  parameterized, audited SELECT
        ▼
internal SQL Server (DBOAB / OAB_DW / DBIMG · db_datareader login · no public IP)
```

## The `leitura-db` gateway contract

The single read endpoint. Always **parameterized** (the gateway rejects DML/DDL/multi-statement):

```bash
POST https://leitura-db.oabpr.org.br/query
Headers: CF-Access-Client-Id, CF-Access-Client-Secret, content-type: application/json
Body: { "db": "DBOAB", "sql": "SELECT ... WHERE Nic = @nic", "params": { "nic": 22076 } }
```

- **Never** concatenate values into the `sql` — everything dynamic goes in `params` with `@name` (anti-SQLi).
- The service token (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`) is a **worker secret**
  (`wrangler secret put`), never in the repo. `.dev.vars` is local only.
- Key tables in `DBOAB`: `Advogado` (`Nic` = internal key, `Nr_Inscricao` = OAB number, `CPF`,
  `Dt_Nascimento`, `Cd_SubSecao`…), `Advogado_Senha`, `Advogado_Cargo`/`Cargo`,
  `Advogado_Comissao`/`Comissao`, `Inscricao`, `Tab_*`.

## Endpoints to reimplement (same contract as v3)

| Endpoint | Purpose | Migration status |
|---|---|---|
| `GET /advogado/me`, `/perfil`, `/advogado`, `/cargos` | lawyer data/profile | **reads — migrate first** |
| `GET /portal/dados-inscricao` | registration | read — migrate first |
| `GET /portal/penalidade-disciplinar`, `/portal/auxilio-maternidade` | benefits/penalties | read — phase 2 |
| `POST /advogado/login-portal` (no password: `nrInscricao+cpf+dtNascimento`) | identity validation | easy migration (compares against `Advogado`) |
| `POST /advogado/login-portal` (with password) | password login | **stays delegated to v3/oab-sso** until the `Advogado_Senha` hash algorithm is confirmed in staging. **Do not migrate now.** |

## Migration strategy (strangler, per endpoint)

1. **Mirror:** the worker answers the endpoint by **forwarding to v3** (zero change).
2. **Shadow:** underneath, it builds the response via `leitura-db` and **compares** with v3 until a 100% match.
3. **Cutover:** it starts serving from `leitura-db`; v3 becomes the **fallback**.
4. **Turn off** the v3 dependency once all endpoints match.

Each step is **reversible**. v3 stays alive as a safety net during the transition.

## Validating against v3 (shadow phase)

To confirm an endpoint reproduces v3's **exact contract**, hit the third-party legacy API and
compare the raw JSON with our response. v3 requires a system Bearer — the `OAB_API_TOKEN`
(the same token `oab-portal` uses for the `/v3/portal/*` and `/v3/advogado/cargos` routes).

- Put the token in `.dev.vars` as `OAB_API_TOKEN` (see `.dev.vars.example`). It is **for validation
  only** — not used at runtime; in production it's `leitura-db` that talks to the database.
- Reference call (e.g., `dados-inscricao`):

  ```bash
  curl -s "https://api.oabpr.org.br/v3/portal/dados-inscricao?oab=69091&tipo=A" \
    -H "Authorization: Bearer $OAB_API_TOKEN" | jq
  ```

- Compare field by field with our endpoint's output — **same keys, same order, same format**
  (e.g., `dataInscricao` is a full datetime `"2013-12-09T00:00:00"`, not a truncated date).
  Shape mismatches are fixed in the `mapper`/`schema`/`query` until it's a **100% match**.

## Writes (future — dedicated gateway)

Writes to the legacy system will **not** go through `leitura-db`. There will be a **separate write
gateway**, mirroring the read one but with its own locks:

- A credential with **minimal per-table GRANT** (only the tables of the operation; e.g., recording an
  analysis = `INSERT` into `PGE_Requerimento_Status` + `UPDATE` on `Pge_Requerimento`), via a **named
  operation** that applies the business rule — never free-form write SQL.
- **Outbox** pattern: the app writes first to **D1** (instant, auditable) and a **reconciler**
  applies it to the legacy system with **idempotency** and a **kill-switch**.
- It only comes in after the read cutover is validated and approved. When it arrives, it lives here too
  (this worker starts exposing the write operations), but pointing at the **write gateway**, not the
  read one.

## Code conventions

- Structure: `src/endpoints/` (chanfana classes = controllers), `src/services/` (logic +
  `queryGateway` + DB→contract mappers), `src/queries/` (**typed Kysely builder functions**),
  `src/schemas/` (Zod), `src/db/` (typed database access). OpenAPI is mounted at the entrypoint.
- **Database access is typed, not raw SQL.** Queries use **Kysely** over the **generated** schema
  (`src/db/schema.ts`) and are **compiled** (`.compile()`, never executed locally) into
  `{ sql, params }`. A nonexistent table/column = a **compile error** (`yarn typecheck`).
  - `src/db/schema.ts` is **generated** by `yarn gen:schema` (it reads `INFORMATION_SCHEMA` through the
    gateway) — **never edit by hand**; regenerate when the database changes.
  - `src/db/client.ts` exposes the `dboab` builder and `execute(env, db, query)` — it compiles and calls
    the gateway preserving the result type (`InferResult`), renaming params to `@p1, @p2…`.
  - `src/db/dialect.ts`: a compile-only dialect (`DummyDriver`) — Kysely only builds/compiles, never connects.
- **A single helper** (`queryGateway`) talks to `leitura-db` and injects the service token; no
  endpoint calls `fetch` on the gateway directly. `client.ts`'s `execute` is the only caller of `queryGateway`.
- Every input and output is validated with **Zod**; the **mapper** (in `src/services/`) translates the
  database row (legacy names, e.g., `Nr_Inscricao`, `Dt_Inscricao`) into the **v3 shape** (`oab`, `dataInscricao`…).
- Validate locally: `yarn dev` + `yarn typecheck`.

## Security / LGPD

- **Zero Trust:** no valid service token → 403 at the edge; the database is never exposed (no public IP).
- **Read-only + parameterized** by default (anti-SQLi comes from the gateway guard, but we build it right too).
- **PII** (`CPF`, `Dt_Nascimento`): scoped, audited reads; **passwords never travel** through here.

## Language

- **Code in English**: identifiers (functions, variables, types, files) and comments always in
  English. Comments **only when truly necessary** — to explain complex logic or a business rule
  (e.g., the why behind a decision), never to narrate the obvious that the code already states.
- **Content visible to the API consumer in Portuguese** with correct accentuation: error messages and
  OpenAPI `summary`/`description`/`tags`. The v3 contract/response is preserved as-is.

---
*Reference pattern already in production: **Dativa OAB-PR** (Workers + D1 + `leitura-db` + oab-sso).
Full plan: `PLANO_MIGRACAO_CLOUDFLARE.md` and `PLANO_MIGRACAO_APIS_V3.md`.*
