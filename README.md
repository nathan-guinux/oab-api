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
yarn gen:schema   # regenera src/db/schema.ts a partir do INFORMATION_SCHEMA do DBOAB
yarn deploy       # publica no Cloudflare (manual)
```

- `GET /health` — verifica a saúde da API.
- `GET /portal/dados-inscricao?oab=` — dados de inscrição do advogado.
- `GET /docs` — Swagger UI (gerado automaticamente pelo chanfana).
- `GET /openapi.json` — schema OpenAPI.

## Acesso ao banco (tipado)

As queries são montadas com **Kysely** sobre o schema **gerado** do banco (`src/db/schema.ts`) e
**compiladas** (`.compile()`, nunca executadas localmente) para `{ sql, params }`, que o
`queryGateway` envia ao `leitura-db`. Referenciar tabela/coluna inexistente é **erro de compilação**
no `yarn typecheck`, não erro em produção.

```
endpoint → queries/ (builder Kysely tipado) → db/client.ts execute() → services/gateway.ts → leitura-db
```

`src/db/schema.ts` é **gerado** (`yarn gen:schema`) — não editar à mão. Regenere quando o banco mudar.

## Secrets

O service token do `leitura-db` **nunca** vai no repo:

- **Local:** copie `.dev.vars.example` para `.dev.vars` e preencha os valores.
- **Produção:** `wrangler secret put CF_ACCESS_CLIENT_ID` e `wrangler secret put CF_ACCESS_CLIENT_SECRET`.

## Estrutura

```
src/
├── index.ts        # entrypoint: Hono + OpenAPI + tratamento de erro + registro de rotas
├── types/env.ts    # tipos de bindings (vars + secrets) e AppContext
├── db/
│   ├── schema.ts   # GERADO (yarn gen:schema): interface Kysely do DBOAB — não editar
│   ├── dialect.ts  # dialeto Kysely compile-only (DummyDriver) que fala com o gateway
│   └── client.ts   # builder tipado (dboab) + execute() que compila e chama o gateway
├── endpoints/      # controllers chanfana (class-based)
├── services/       # regra de negócio + queryGateway (único ponto de contato com leitura-db)
├── queries/        # funções builder Kysely (tipadas)
└── schemas/        # Zod compartilhado (shape do contrato v3)
```
