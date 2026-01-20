/**
 * esbuild plugin for Effect source location tracing.
 *
 * @example
 * ```ts
 * import esbuild from "esbuild"
 * import effectSourceTrace from "@effect/unplugin/esbuild"
 *
 * esbuild.build({
 *   plugins: [effectSourceTrace()]
 * })
 * ```
 *
 * @since 0.0.1
 */
import unplugin from "./index.ts"

export default unplugin.esbuild
