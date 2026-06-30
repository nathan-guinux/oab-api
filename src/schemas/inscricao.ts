import { z } from "zod";

// v3 contract shape for GET /portal/dados-inscricao (fields the portal consumes).
// Widen via the shadow phase once the full v3 response is captured.
export const DadosInscricaoSchema = z.object({
  dataInscricao: z.string().nullable(),
  tipoInscricao: z.string().nullable(),
});

export type DadosInscricao = z.infer<typeof DadosInscricaoSchema>;
