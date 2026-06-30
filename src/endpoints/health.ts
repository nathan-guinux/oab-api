import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types/env";

export class HealthCheck extends OpenAPIRoute {
  schema = {
    tags: ["Sistema"],
    summary: "Verifica a saúde da API",
    responses: {
      "200": {
        description: "API operacional",
        ...contentJson(
          z.object({
            status: z.literal("ok"),
            service: z.string(),
            version: z.string(),
          }),
        ),
      },
    },
  };

  async handle(_c: AppContext) {
    return { status: "ok" as const, service: "oab-api", version: "0.1.0" };
  }
}
