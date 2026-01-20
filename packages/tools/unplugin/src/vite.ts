/**
 * Vite plugin for Effect source location tracing.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite"
 * import effectSourceTrace from "@effect/unplugin/vite"
 *
 * export default defineConfig({
 *   plugins: [effectSourceTrace()]
 * })
 * ```
 *
 * @since 0.0.1
 */
import unplugin from "./index.ts"

export default unplugin.vite
