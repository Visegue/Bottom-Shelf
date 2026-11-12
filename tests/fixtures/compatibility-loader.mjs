// Local test process only. The app's actual old/new code uses real Postgres;
// S3 is deterministic here. Real private S3 is verified by the preview pipeline.
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only")
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (["@neondatabase/serverless", "@aws-sdk/client-s3"].includes(specifier))
      return {
        url: new URL("./compatibility-services.mjs", import.meta.url).href,
        shortCircuit: true,
      };
    if (
      specifier === "./config" &&
      context.parentURL?.endsWith("/foundation.ts")
    )
      return {
        url: new URL("./config.ts", context.parentURL).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts"))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
