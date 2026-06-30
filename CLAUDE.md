# OAB API — Regras para o Claude

API de dados central da OAB-PR. Um **Cloudflare Worker** independente, escrito em **TypeScript**
com **Hono + cloudflare/chanfana + Zod**, cuja única função é **ler o banco legado da OAB pelo
gateway `leitura-db`** e expor isso como uma API limpa e versionada para os **demais sistemas**
(`oab-portal`, `oab-esa`, etc.).

> Este worker **substitui a `api.oabpr.org.br/v3`** (a "v3 do advogado"). Os apps consumidores não
> falam mais com a API de terceiros — falam com este worker, mantendo **o mesmo contrato**.

## Objetivo (a grande ideia)

- Hoje os sistemas dependem da **`api.oabpr.org.br/v3`** (API de terceiros) que lê o SQL Server.
- Vamos **reimplementar essa API como Worker próprio**, que lê o `DBOAB`/`OAB_DW`/`DBIMG` pelo
  gateway `leitura-db` — em vez de chamar terceiros, e **sem nunca colar SQL direto no banco**.
- **Centraliza**: o SQL e o service token vivem **só aqui**. Os apps consumidores só trocam a URL
  base; o JSON de resposta continua igual.
- É a peça da migração **strangler** (substituir o legado módulo a módulo, sem big-bang).

## O que este worker NÃO é

- **Não** é o `oab-sso` — autenticação de pessoa (cookie `sso_token`) continua sendo dele. Este
  worker é **só dados**. (Decisão: worker **separado, fora do oab-sso**.)
- **Não** tem UI/páginas. É API pura (por isso Worker puro, não Next/OpenNext).
- **Não** escreve no legado **na fase atual** (somente leitura). A escrita virá depois, por um
  **gateway de escrita dedicado** (separado do `leitura-db`), least-privilege — ver "Escrita (futuro)".

## Stack

- **Runtime:** Cloudflare Workers (V8 isolate). NestJS **não** roda aqui (precisa de Node completo);
  por isso Hono.
- **Framework:** [Hono](https://hono.dev) + [`cloudflare/chanfana`](https://github.com/cloudflare/chanfana)
  — endpoints **class-based** (estilo controller) com validação **Zod** e **OpenAPI/Swagger gerado
  automaticamente** (importante: outros sistemas consomem esta API).
- **Linguagem:** TypeScript, sempre.
- **Gerenciador de pacotes:** **yarn**, exclusivamente. Nunca `npm`/`pnpm`.
- **Dados próprios (quando precisar):** D1 (SQL), KV (cache/rate-limit), R2 (arquivos) — mesmo
  padrão do `oab-portal`.

## Como o dado trafega

```
oab-portal / oab-esa / outros          ← apps consumidores (trocam só a URL base)
        │  HTTPS (contrato igual ao da v3)
        ▼
oab-api  (ESTE worker)                  ← monta o SQL, guarda o service token
        │  POST /query  + headers CF-Access-Client-Id / CF-Access-Client-Secret
        ▼
leitura-db.oabpr.org.br                 ← gateway read-only (Access → Tunnel → adaptador Node → SQL)
        │  SELECT parametrizado, auditado
        ▼
SQL Server interno (DBOAB / OAB_DW / DBIMG · login db_datareader · sem IP público)
```

## Contrato do gateway `leitura-db`

Único endpoint de leitura. Sempre **parametrizado** (o gateway recusa DML/DDL/multi-statement):

```bash
POST https://leitura-db.oabpr.org.br/query
Headers: CF-Access-Client-Id, CF-Access-Client-Secret, content-type: application/json
Body: { "db": "DBOAB", "sql": "SELECT ... WHERE Nic = @nic", "params": { "nic": 22076 } }
```

- **Nunca** concatenar valores no `sql` — todo dinâmico vai em `params` com `@nome` (anti-SQLi).
- O service token (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`) é **secret do worker**
  (`wrangler secret put`), nunca no repo. `.dev.vars` é só local.
- Tabelas-chave no `DBOAB`: `Advogado` (`Nic` = chave interna, `Nr_Inscricao` = OAB, `CPF`,
  `Dt_Nascimento`, `Cd_SubSecao`…), `Advogado_Senha`, `Advogado_Cargo`/`Cargo`,
  `Advogado_Comissao`/`Comissao`, `Inscricao`, `Tab_*`.

## Endpoints a reimplementar (contrato igual ao da v3)

| Endpoint | Para quê | Status de migração |
|---|---|---|
| `GET /advogado/me`, `/perfil`, `/advogado`, `/cargos` | dados/perfil do advogado | **reads — migram primeiro** |
| `GET /portal/dados-inscricao` | inscrição | read — migra primeiro |
| `GET /portal/penalidade-disciplinar`, `/portal/auxilio-maternidade` | benefícios/penalidades | read — fase 2 |
| `POST /advogado/login-portal` (sem senha: `nrInscricao+cpf+dtNascimento`) | validação de identidade | migra fácil (compara no `Advogado`) |
| `POST /advogado/login-portal` (com senha) | login com senha | **fica delegado à v3/oab-sso** até o algoritmo de hash de `Advogado_Senha` ser confirmado em homologação. **Não migrar agora.** |

## Estratégia de migração (strangler, por endpoint)

1. **Espelho:** o worker responde o endpoint **repassando pra v3** (zero mudança).
2. **Sombra:** por baixo, monta a resposta via `leitura-db` e **compara** com a v3 até bater 100%.
3. **Cutover:** passa a servir do `leitura-db`; a v3 fica como **fallback**.
4. **Desligar** a dependência da v3 quando todos os endpoints baterem.

Cada passo é **reversível**. A v3 permanece viva como rede de segurança durante a transição.

## Escrita (futuro — gateway dedicado)

A escrita no legado **não** passará pelo `leitura-db`. Haverá um **gateway de escrita separado**,
espelho do de leitura, mas com travas próprias:

- Credencial com **GRANT mínimo por tabela** (só as tabelas da operação; ex.: registrar análise =
  `INSERT` em `PGE_Requerimento_Status` + `UPDATE` em `Pge_Requerimento`), via **operação nomeada**
  que aplica a regra de negócio — nunca SQL livre de escrita.
- Padrão **outbox**: a app grava primeiro no **D1** (instantâneo, auditável) e um **reconciliador**
  aplica no legado com **idempotência** e **kill-switch**.
- Entra só após cutover de leitura validado e com aprovação. Quando chegar, mora aqui também (este
  worker passa a expor as operações de escrita), mas apontando para o **gateway de escrita**, não o
  de leitura.

## Convenções de código

- Estrutura: `src/endpoints/` (classes chanfana = controllers), `src/services/` (regra +
  `queryGateway` + mappers DB→contrato), `src/queries/` (**funções builder Kysely**, tipadas),
  `src/schemas/` (Zod), `src/db/` (acesso tipado ao banco). OpenAPI montado no entrypoint.
- **Acesso ao banco é tipado, não SQL cru.** As queries usam **Kysely** sobre o schema **gerado**
  (`src/db/schema.ts`) e são **compiladas** (`.compile()`, nunca executadas localmente) para
  `{ sql, params }`. Tabela/coluna inexistente = **erro de compilação** (`yarn typecheck`).
  - `src/db/schema.ts` é **gerado** por `yarn gen:schema` (lê o `INFORMATION_SCHEMA` pelo gateway) —
    **nunca editar à mão**; regenerar quando o banco mudar.
  - `src/db/client.ts` expõe o builder `dboab` e `execute(env, db, query)` — compila e chama o
    gateway preservando o tipo do resultado (`InferResult`), renomeando os params para `@p1, @p2…`.
  - `src/db/dialect.ts`: dialeto compile-only (`DummyDriver`) — Kysely só monta/compila, nunca conecta.
- **Um helper único** (`queryGateway`) fala com o `leitura-db` e injeta o service token; nenhum
  endpoint chama `fetch` no gateway direto. O `execute` do `client.ts` é o único que chama `queryGateway`.
- Toda entrada e saída validada com **Zod**; o **mapper** (em `src/services/`) traduz a linha do banco
  (nomes legados, ex.: `Nr_Inscricao`, `Dt_Inscricao`) para o **shape da v3** (`oab`, `dataInscricao`…).
- Validar local: `yarn dev` + `yarn typecheck`.

## Segurança / LGPD

- **Zero Trust:** sem service token válido → 403 na borda; o banco nunca é exposto (sem IP público).
- **Read-only + parametrizado** por padrão (anti-SQLi vem do guard do gateway, mas montamos certo).
- **PII** (`CPF`, `Dt_Nascimento`): reads escopados e auditados; **senha nunca trafega** por aqui.

## Idioma

- **Código em inglês**: identificadores (funções, variáveis, tipos, arquivos) e comentários sempre em
  inglês. Comentários **só quando realmente necessários** — para explicar lógica complexa ou regra de
  negócio (ex.: o porquê de uma decisão), nunca para narrar o óbvio que o código já diz.
- **Conteúdo visível ao consumidor da API em português** com acentuação correta: mensagens de erro e
  `summary`/`description`/`tags` do OpenAPI. O contrato/resposta da v3 é preservado como está.

---
*Padrão de referência já em produção: **Dativa OAB-PR** (Workers + D1 + `leitura-db` + oab-sso).
Plano completo: `PLANO_MIGRACAO_CLOUDFLARE.md` e `PLANO_MIGRACAO_APIS_V3.md`.*
