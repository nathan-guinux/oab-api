import type { Env } from "../types/env";

export type LeituraDb = "DBOAB" | "OAB_DW" | "DBIMG";

export interface GatewayQuery {
  db: LeituraDb;
  sql: string; // always parameterized: WHERE x = @name — never concatenate values
  params?: Record<string, unknown>;
}

/**
 * Single point of contact with the `leitura-db` gateway. Injects the service
 * token; no endpoint should call `fetch` on the gateway directly.
 */
export async function queryGateway<T = Record<string, unknown>>(
  env: Env,
  { db, sql, params }: GatewayQuery,
): Promise<T[]> {
  const res = await fetch(`${env.LEITURA_DB_URL}/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
    },
    body: JSON.stringify({ db, sql, params: params ?? {} }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`leitura-db ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as { rows?: T[] };
  return data.rows ?? [];
}
