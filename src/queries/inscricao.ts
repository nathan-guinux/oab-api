import { dboab } from "../db/client";

/**
 * Registration data for a lawyer by OAB number. Type-safe: table/column typos
 * fail at `yarn typecheck`. Mirrors the v3 `GET /portal/dados-inscricao` source.
 */
export function dadosInscricaoQuery(oab: string) {
  return dboab
    .selectFrom("Advogado as a")
    .leftJoin("Tab_TipoInscricao as ti", "ti.Tp_Inscricao", "a.Tp_Inscricao")
    .select(["a.Nr_Inscricao", "a.Dt_Inscricao", "ti.Descricao as tipoInscricao"])
    .where("a.Nr_Inscricao", "=", oab);
}
