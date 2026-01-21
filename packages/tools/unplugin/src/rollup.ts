/**
 * Rollup plugin for Effect source location tracing.
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import effectSourceTrace from "@effect/unplugin/rollup"
 *
 * export default {
 *   plugins: [effectSourceTrace()]
 * }
 * ```
 *
 * @since 0.0.1
 */
import unplugin from "./index.ts"

export default unplugin.rollup
