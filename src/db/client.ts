import { type Compilable, type InferResult, Kysely } from "kysely";
import { gatewayDialect } from "./dialect";
import type { DBOAB } from "./schema";
import { type LeituraDb, queryGateway } from "../services/gateway";
import type { Env } from "../types/env";

/**
 * Type-safe query builder for DBOAB. Compile-only — referencing a table or
 * column that doesn't exist is a compile-time error (`yarn typecheck`), not a
 * runtime gateway 207. Build a query, then run it through `execute`.
 */
export const dboab = new Kysely<DBOAB>({ dialect: gatewayDialect });

/**
 * Compiles a Kysely query and runs it through the `leitura-db` gateway,
 * preserving the builder's inferred row type. Renames the compiled positional
 * params to the `@p1, @p2, ...` names the gateway dialect emits.
 */
export async function execute<Q extends Compilable<unknown>>(
  env: Env,
  db: LeituraDb,
  query: Q,
): Promise<InferResult<Q>> {
  const { sql, parameters } = query.compile();
  const params = Object.fromEntries(parameters.map((value, i) => [`p${i + 1}`, value]));
  return queryGateway(env, { db, sql, params }) as Promise<InferResult<Q>>;
}
