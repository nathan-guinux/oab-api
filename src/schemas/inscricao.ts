import { z } from "zod";

// v3 contract shape for GET /portal/dados-inscricao. Matches the raw v3 response
// captured in the shadow phase: full datetime in dataInscricao, plus subSecao.
export const DadosInscricaoSchema = z.object({
  dataInscricao: z.string().nullable(),
  tipoInscricao: z.string().nullable(),
  subSecao: z.string().nullable(),
});

export type DadosInscricao = z.infer<typeof DadosInscricaoSchema>;
