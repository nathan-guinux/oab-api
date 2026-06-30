import {
  type Dialect,
  DummyDriver,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
} from "kysely";

/**
 * The MSSQL compiler emits parameter placeholders as `@1, @2, ...` (1-based,
 * because `addParameter` runs before the placeholder is appended). SQL Server
 * rejects a purely numeric variable name, and the `leitura-db` gateway expects
 * named params, so we rename them to `@p1, @p2, ...` — kept aligned with the
 * compiled `parameters` array in `client.ts` (`parameters[i]` -> key `p${i + 1}`).
 */
class GatewayQueryCompiler extends MssqlQueryCompiler {
  protected override getCurrentParameterPlaceholder(): string {
    return `@p${this.numParameters}`;
  }
}

/**
 * Compile-only dialect: we never open a connection (`DummyDriver`); queries are
 * built type-safely with Kysely and `.compile()`d to `{ sql, parameters }`,
 * which `client.ts` forwards to the gateway. The introspector is required by the
 * Dialect interface but is never invoked at runtime.
 */
export const gatewayDialect: Dialect = {
  createAdapter: () => new MssqlAdapter(),
  createDriver: () => new DummyDriver(),
  createIntrospector: (db) => new MssqlIntrospector(db),
  createQueryCompiler: () => new GatewayQueryCompiler(),
};
