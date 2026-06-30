import { Hono } from "hono";
import { fromHono } from "chanfana";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types/env";
import { HealthCheck } from "./endpoints/health";
import { DadosInscricaoEndpoint } from "./endpoints/portal/dadosInscricao";

const app = new Hono<{ Bindings: Env }>();

const openapi = fromHono(app, {
  docs_url: "/docs",
  openapi_url: "/openapi.json",
  schema: {
    info: {
      title: "OAB API",
      version: "0.1.0",
      description:
        "API central de dados da OAB-PR. Substitui a v3 do advogado, lendo o legado pelo gateway leitura-db.",
    },
  },
});

openapi.get("/health", HealthCheck);
openapi.get("/portal/dados-inscricao", DadosInscricaoEndpoint);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error("[onError]", err);
  return c.json(
    { success: false, errors: [{ code: 7000, message: "Erro interno do servidor." }] },
    500,
  );
});

export default app;
