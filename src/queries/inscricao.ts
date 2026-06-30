import { dboab } from "../db/client";

/**
 * Registration data for a lawyer by OAB number.
 */
export function dadosInscricaoQuery(oab: string) {
  return dboab
    .selectFrom("Advogado as a")
    .leftJoin("Tab_TipoInscricao as ti", "ti.Tp_Inscricao", "a.Tp_Inscricao")
    .leftJoin("Tab_SubSecao as ss", "ss.Cd_SubSecao", "a.Cd_SubSecao")
    .select([
      "a.Nr_Inscricao",
      "a.Dt_Inscricao",
      "ti.Descricao as tipoInscricao",
      "ss.Nome as subSecao",
    ])
    .where("a.Nr_Inscricao", "=", oab);
}
