import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types/env";
import { DadosInscricaoSchema } from "../../schemas/inscricao";
import { getDadosInscricao } from "../../services/inscricao";

export class DadosInscricaoEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Portal"],
    summary: "Dados de inscrição do advogado",
    request: {
      query: z.object({
        oab: z.string().min(1).describe("Número de inscrição na OAB"),
        tipo: z.string().optional().describe('Tipo de inscrição (padrão "A")'),
      }),
    },
    responses: {
      "200": {
        description: "Dados de inscrição do advogado",
        ...contentJson(DadosInscricaoSchema),
      },
      "404": {
        description: "Advogado não encontrado",
        ...contentJson(
          z.object({
            success: z.literal(false),
            errors: z.array(z.object({ code: z.number(), message: z.string() })),
          }),
        ),
      },
    },
  };

  async handle(c: AppContext) {
    const { query } = await this.getValidatedData<typeof this.schema>();
    const dados = await getDadosInscricao(c.env, query.oab);
    if (!dados) {
      return c.json(
        { success: false, errors: [{ code: 4004, message: "Advogado não encontrado." }] },
        404,
      );
    }
    return dados;
  }
}
