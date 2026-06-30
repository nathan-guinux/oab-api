import { execute } from "../db/client";
import { dadosInscricaoQuery } from "../queries/inscricao";
import type { DadosInscricao } from "../schemas/inscricao";
import type { Env } from "../types/env";

/**
 * Reads registration data from DBOAB and maps the legacy row to the v3 contract
 * shape. The only place that knows the raw column names.
 */
export async function getDadosInscricao(env: Env, oab: string): Promise<DadosInscricao | null> {
  const [row] = await execute(env, "DBOAB", dadosInscricaoQuery(oab));
  if (!row) return null;
  return {
    dataInscricao: row.Dt_Inscricao ? row.Dt_Inscricao.slice(0, 10) : null,
    tipoInscricao: row.tipoInscricao,
  };
}
