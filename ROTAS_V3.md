# Rotas da `api.oabpr.org.br` a migrar — contrato a preservar

> Levantamento de **todas as rotas da API de terceiros** que o `oab-portal` consome hoje, com os
> **campos que cada resposta devolve** (extraídos de como o portal de fato lê o JSON). Este é o
> **contrato** que o `oab-api` precisa reproduzir na migração strangler — a resposta tem que manter
> o mesmo shape.
>
> Fonte: `oab-portal/src/lib/server/oab-api.ts` (wrapper) + os route handlers que consomem.
> Campos marcados `?` são opcionais / lidos defensivamente pelo portal. Tabelas no `DBOAB` são a
> origem provável no `leitura-db` — **a confirmar em homologação** (fase de sombra).

---

## Resumo

| # | Rota (`api.oabpr.org.br`) | Método | Entrada | Fase | Origem provável (DBOAB) |
|---|---|---|---|---|---|
| 1 | `/v3/portal/dados-inscricao` | GET | `oab`, `tipo` | **1 — read** | `Inscricao` + `Advogado` + `Tab_TipoInscricao` + `Tab_SubSecao` |
| 2 | `/v3/advogado/cargos/:oab` | GET | `:oab` | **1 — read** | `Advogado_Cargo`+`Cargo`, `Advogado_Comissao`+`Comissao` |
| 3 | `/v3/advogado/me` · `/perfil` · `/advogado` | GET | Bearer do advogado | 1 — read | `Advogado` (+joins) |
| 4 | `/v3/portal/auxilio-maternidade` | GET | `oab` | 2 — read | *(tabela a confirmar)* |
| 5 | `/v3/portal/penalidade-disciplinar` | GET | `oab`, `tipo` | 2 — read | tabelas de penalidade *(confirmar)* |
| 6 | `/v3/advogado/login-portal` (sem senha) | POST | `nrInscricao`+`cpf`+`dtNascimento` | 3 — identidade | `Advogado` (compara) |
| 7 | `/v3/advogado/login-portal` (com senha) | POST | `login`+`senha` | **NÃO migrar** | `Advogado_Senha` (hash a confirmar) |
| 8 | `/advogado/LoginAdvogadoCAA` (legada, sem `/v3`) | POST | `nrInscricao`+`cpf`+`dtNascimento` | 3 — identidade | `Advogado` (compara) |

> Fora de escopo deste worker: `comunidades.oabpr.org.br/api/perfil/:oab` (oab-social, serviço
> próprio — **mantém**, não é DB legado).

---

## 1. `GET /v3/portal/dados-inscricao?oab=&tipo=`

Dados da inscrição. **Candidata nº 1 a migrar** (read puro, escopado por OAB).

- **Entrada:** query `oab` (string), `tipo` (string, default `"A"`). Header `Authorization: Bearer {OAB_API_TOKEN}` (token de sistema).
- **Campos lidos pelo portal:**

| Campo | Tipo | Uso |
|---|---|---|
| `dataInscricao` | string (`YYYY-MM-DD`) | data de inscrição (convertida p/ `DD/MM/YYYY` na certidão) |
| `tipoInscricao` | string (`"ADVOGADO PRINCIPAL"`, `"SUPLEMENTAR"`, `"ESTAGIÁRIO"`…) | tipo da inscrição |

- **Consumido em:** `api/solicitacoes/certidao-regularidade/route.ts`.
- **Origem:** `Inscricao` + `Advogado` + `Tab_TipoInscricao` + `Tab_SubSecao`.

## 2. `GET /v3/advogado/cargos/:oab`

Cargos/funções do advogado na OAB.

- **Entrada:** path `:oab`. Header `Authorization: Bearer {OAB_API_TOKEN}`.
- **Resposta:** **array** repassado **as-is** (o portal não lê campos individuais; só cacheia no D1 e devolve). O shape do elemento precisa ser **capturado na fase de sombra** (rodar a v3 e gravar o JSON real).
- **Consumido em:** `api/advogado/cargos/[oab]/route.ts` (cacheia em D1; fallback = última versão do D1 se a API falhar).
- **Origem:** `Advogado_Cargo`+`Cargo`, `Advogado_Comissao`+`Comissao` (via `Nic`).

## 3. `GET /v3/advogado/me` · `/v3/advogado/perfil` · `/v3/advogado`

Perfil do advogado logado. No portal são tentadas **em sequência** (`/me` → `/perfil` → `/advogado`) só para extrair dados de dativo.

- **Entrada:** header `Authorization: Bearer {token}` (token **pessoal** do advogado, vindo do login).
- **Campos lidos** (só estes três — o portal ignora o resto):

| Campo | Tipo | Uso |
|---|---|---|
| `dativo` | boolean | se é advogado dativo |
| `aReceber` | `Array<{ valor: number \| string }>` | valores a receber (soma `.valor`) |
| `totalRecebidos` | number \| string | total recebido |

- **Consumido em:** `api/advogado/refresh-dativo/route.ts` (fallback final: `POST /v3/advogado/login-portal` com `{token}`).

## 4. `GET /v3/portal/auxilio-maternidade?oab=`

Situação simplificada da inscrição (apesar do nome). — **Fase 2.**

- **Entrada:** query `oab`. Header `Authorization: Bearer {OAB_API_TOKEN}`.
- **Campos lidos:**

| Campo | Tipo | Uso |
|---|---|---|
| `inscricaoRegular` | boolean | inscrição regular |
| `anuidadeEmDia` | boolean | anuidade em dia |
| `inscritoOabPr` | boolean? | inscrito na OAB-PR (usado no import CAA) |
| `maisDeUmAno` | boolean? | mais de um ano de inscrição (import CAA) |
| `mensagem` | string[]? | mensagens (import CAA) |

- **Consumido em:** `api/regularidade/[oab]/route.ts` (rota pública), `api/solicitacoes/certidao-regularidade/route.ts`, `lib/server/caa-import.ts`.
- **Comportamento:** portal trata `null` de forma otimista (falha de API ≠ irregular).

## 5. `GET /v3/portal/penalidade-disciplinar?oab=&tipo=`

Penalidades disciplinares. — **Fase 2.**

- **Entrada:** query `oab`, `tipo` (default `"A"`). Header `Authorization: Bearer {OAB_API_TOKEN}`.
- **Resposta:** **array** de:

| Campo | Tipo | Uso |
|---|---|---|
| `pena` | string (`"ADVERTÊNCIA"`, `"CENSURA"`, `"SUSPENSÃO"`, `"EXCLUSÃO"`, `"EXTINÇÃO"`) | tipo da penalidade |
| `processo` | string? | número do processo |

- **Regra de negócio:** `"EXTINÇÃO"` = processo extinto **sem** pena (não conta). Só `ADVERTÊNCIA/CENSURA/SUSPENSÃO/EXCLUSÃO` contam como penalidade efetiva.
- **Consumido em:** `api/solicitacoes/certidao-regularidade/route.ts`.

## 6–7. `POST /v3/advogado/login-portal`

Dois modos. Resposta completa do perfil (tipo `AdvogadoLoginPortal` no portal).

- **Entrada (modo sem senha — identidade, Fase 3):** `{ nrInscricao, cpf, dtNascimento }`. Migra fácil: compara contra `Advogado`.
- **Entrada (modo com senha — NÃO migrar):** `{ login, senha }`. Header `Authorization: Bearer {OAB_API_TOKEN}`. Fica delegado à v3/oab-sso até o **hash de `Advogado_Senha`** ser confirmado em homologação.
- **Campos lidos pelo portal:**

| Campo | Tipo | Uso |
|---|---|---|
| `nome` | string | nome do advogado |
| `oab` | string? | número OAB |
| `email` | string? | e-mail |
| `cpf` | string? | CPF |
| `celular` | string? | telefone |
| `subsecao` | objeto? | subseção |
| `especialidades` | array? | especialidades |
| `comissoes` | array? | comissões |
| `cargos` | array? | cargos |
| `dativo` | boolean? | é dativo |
| `aReceber` | `Array<{ valor }>?` | valores a receber |
| `totalRecebidos` | number \| string? | total recebido |
| `temDebitos` | boolean \| null? | tem débitos |
| `token` | string? | JWT da v3 (reusado no refresh) |

> `portalToken` / `tokenType` são adicionados **pelo portal**, não vêm da v3.

- **Consumido em:** `api/advogado/login-portal/route.ts` (sincroniza tudo no D1 `advogado_perfil`), `api/advogado/refresh-dados/route.ts`.

## 8. `POST /advogado/LoginAdvogadoCAA` (legada, **sem** `/v3`)

Valida OAB + CPF + nascimento (login CAA). — **Fase 3 (identidade).**

- **Entrada:** `{ nrInscricao, tipoInscricao: "A", cpf (só dígitos), dtNascimento }`. Header `Authorization: Bearer {CAA_API_TOKEN}`.
- **Campos lidos** (atenção: **PascalCase**, diferente do `login-portal`):

| Campo | Tipo | Uso |
|---|---|---|
| `Action` | string (`"success"`) | resultado |
| `Message` | string | mensagem de erro/sucesso |
| `Email` | string | e-mail do advogado |
| `Nome` | string | nome completo |

- **Consumido em:** `api/advogado/login/route.ts`, `api/advogado/enviar-codigo/route.ts`, `api/advogado/google-auth/route.ts`.
- **Origem:** `Advogado` (compara inscrição/CPF/nascimento; sem senha).

---

## Tokens / env (no `oab-portal` hoje)

- `OAB_API_TOKEN` — Bearer de sistema para as rotas `/v3/portal/*` e `/v3/advogado/cargos`, `login-portal` (refresh).
- `CAA_API_TOKEN` — Bearer da rota legada `LoginAdvogadoCAA`.
- Bearer **pessoal do advogado** — para `/v3/advogado/me|perfil|advogado` (vem do login).

Na nova arquitetura esses tokens **somem do consumidor**: o `oab-api` guarda o service token do
`leitura-db`; o portal só troca a URL base e mantém a mesma auth de pessoa (oab-sso).

## Ordem sugerida de migração

1. `dados-inscricao` (#1) — read puro, 2 campos, sem PII sensível. **Começar por aqui.**
2. `cargos` (#2) — read; capturar shape real na sombra.
3. `me/perfil/advogado` (#3) — só 3 campos de dativo.
4. `auxilio-maternidade` (#4) e `penalidade-disciplinar` (#5) — Fase 2.
5. `login-portal` sem senha (#6) e `LoginAdvogadoCAA` (#8) — Fase 3, identidade.
6. `login-portal` com senha (#7) — **fica na v3** até o hash ser confirmado.
