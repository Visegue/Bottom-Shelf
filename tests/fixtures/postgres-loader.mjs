// Replace only the external PostgreSQL boundary when exercising the real CLI.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "pg"
      ? {
          url: new URL("./postgres-double.mjs", import.meta.url).href,
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
