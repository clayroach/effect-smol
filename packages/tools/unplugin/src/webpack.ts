/**
 * Webpack plugin for Effect source location tracing.
 *
 * @example
 * ```ts
 * // webpack.config.js
 * import effectSourceTrace from "@effect/unplugin/webpack"
 *
 * export default {
 *   plugins: [effectSourceTrace()]
 * }
 * ```
 *
 * @since 0.0.1
 */
import unplugin from "./index.ts"

export default unplugin.webpack
