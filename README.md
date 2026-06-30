# oab-api

API central de dados da OAB-PR — um **Cloudflare Worker** (Hono + chanfana + Zod) que substitui a
`api.oabpr.org.br/v3` ("v3 do advogado"), lendo o banco legado pelo gateway **`leitura-db`** e
expondo um contrato limpo e versionado para os demais sistemas (`oab-portal`, `oab-esa`, ...).

> Worker **somente leitura** nesta fase. Regras completas e estratégia de migração: ver
> [`CLAUDE.md`](./CLAUDE.md).

## Desenvolvimento

```bash
yarn install      # instala dependências
yarn dev          # sobe o worker local (http://localhost:8787)
yarn typecheck    # tsc --noEmit
yarn deploy       # publica no Cloudflare (manual)
```

- `GET /health` — verifica a saúde da API.
- `GET /docs` — Swagger UI (gerado automaticamente pelo chanfana).
- `GET /openapi.json` — schema OpenAPI.

## Secrets

O service token do `leitura-db` **nunca** vai no repo:

- **Local:** copie `.dev.vars.example` para `.dev.vars` e preencha os valores.
- **Produção:** `wrangler secret put CF_ACCESS_CLIENT_ID` e `wrangler secret put CF_ACCESS_CLIENT_SECRET`.

## Estrutura

```
src/
├── index.ts        # entrypoint: Hono + OpenAPI + tratamento de erro + registro de rotas
├── types/env.ts    # tipos de bindings (vars + secrets) e AppContext
├── endpoints/      # controllers chanfana (class-based)
├── services/       # regra de negócio + queryGateway (único ponto de contato com leitura-db)
├── queries/        # SELECTs nomeados
└── schemas/        # Zod compartilhado
```
