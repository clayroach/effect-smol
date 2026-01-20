/**
 * Build-time AST transformer for Effect source location tracing and auto-instrumentation.
 *
 * Provides two features:
 * 1. **Source Tracing**: Transforms `yield*` expressions inside `Effect.gen()` to
 *    inject source location information via `CurrentStackFrame`.
 * 2. **Span Instrumentation**: Wraps Effect combinators with `withSpan()` for
 *    automatic distributed tracing with OpenTelemetry semantic conventions.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite"
 * import effectSourceTrace from "@effect/unplugin/vite"
 *
 * export default defineConfig({
 *   plugins: [effectSourceTrace({
 *     // Enable source tracing (default: true)
 *     sourceTrace: true,
 *     // Enable span instrumentation
 *     spans: {
 *       enabled: true,
 *       include: ["gen", "fork", "all", "forEach"],
 *       nameFormat: "function" // "function" | "location" | "full"
 *     }
 *   })]
 * })
 * ```
 *
 * @since 0.0.1
 */
import { createUnplugin, type TransformResult as UnpluginTransformResult } from "unplugin"
import { transform } from "./sourceTrace.ts"
import type { FilterPattern, SourceTraceOptions } from "./types.ts"

export { type TransformResult } from "./sourceTrace.ts"
export type { FilterPattern, InstrumentableEffect, SourceTraceOptions, SpanInstrumentationOptions } from "./types.ts"

const defaultInclude: ReadonlyArray<string | RegExp> = [/\.[jt]sx?$/]
const defaultExclude: ReadonlyArray<string | RegExp> = [/node_modules/]

function toArray(value: FilterPattern | undefined): ReadonlyArray<string | RegExp> {
  if (value === undefined) return []
  if (Array.isArray(value)) return value
  return [value as string | RegExp]
}

function createFilter(
  include: FilterPattern | undefined,
  exclude: FilterPattern | undefined
): (id: string) => boolean {
  const includePatterns = toArray(include ?? defaultInclude)
  const excludePatterns = toArray(exclude ?? defaultExclude)

  return (id: string): boolean => {
    for (const pattern of excludePatterns) {
      if (typeof pattern === "string" ? id.includes(pattern) : pattern.test(id)) {
        return false
      }
    }
    for (const pattern of includePatterns) {
      if (typeof pattern === "string" ? id.includes(pattern) : pattern.test(id)) {
        return true
      }
    }
    return false
  }
}

/**
 * Creates the Effect source trace unplugin.
 *
 * @since 0.0.1
 * @category unplugin
 */
export const unplugin = createUnplugin<SourceTraceOptions | undefined>((options = {}) => {
  const filter = createFilter(options.include, options.exclude)

  return {
    name: "effect-source-trace",
    enforce: "pre",

    transformInclude(id) {
      return filter(id)
    },

    transform(code, id) {
      const result = transform(code, id, options)
      if (!result.transformed) {
        return null
      }
      return { code: result.code, map: result.map } as UnpluginTransformResult
    }
  }
})

export default unplugin
