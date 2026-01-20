/**
 * @since 0.0.1
 */

/**
 * Filter pattern for file matching.
 *
 * @since 0.0.1
 * @category models
 */
export type FilterPattern = string | RegExp | ReadonlyArray<string | RegExp>

/**
 * Effect combinators that can be auto-instrumented with spans.
 *
 * @since 0.0.1
 * @category models
 */
export type InstrumentableEffect =
  | "gen"
  | "fork"
  | "forkDaemon"
  | "forkScoped"
  | "all"
  | "forEach"
  | "filter"
  | "reduce"
  | "iterate"
  | "loop"

/**
 * Span name format options.
 *
 * @since 0.0.1
 * @category models
 */
export type SpanNameFormat = "function" | "location" | "full"

/**
 * File/function filtering for a specific combinator.
 *
 * @since 0.0.1
 * @category models
 */
export interface CombinatorFilter {
  /**
   * File glob patterns to include (single or array)
   */
  readonly files?: string | ReadonlyArray<string> | undefined
  /**
   * File glob patterns to exclude (single or array)
   */
  readonly excludeFiles?: string | ReadonlyArray<string> | undefined
  /**
   * Function name regex patterns to include (single or array)
   */
  readonly functions?: string | ReadonlyArray<string> | undefined
  /**
   * Function name regex patterns to exclude (single or array)
   */
  readonly excludeFunctions?: string | ReadonlyArray<string> | undefined
}

/**
 * Depth-based instrumentation strategy.
 *
 * @since 0.0.1
 * @category models
 */
export interface DepthInstrumentationStrategy {
  readonly type: "depth"
  /**
   * Global max nesting depth for all combinators (default: Infinity)
   * 0 = top-level only, 1 = one level deep, etc.
   */
  readonly maxDepth?: number | undefined
  /**
   * Per-combinator depth limits (overrides maxDepth)
   */
  readonly perCombinator?: Partial<Record<InstrumentableEffect, number>> | undefined
}

/**
 * Override-based instrumentation strategy with file/function filtering.
 *
 * @since 0.0.1
 * @category models
 */
export interface OverrideInstrumentationStrategy {
  readonly type: "overrides"
  /**
   * Per-combinator filter rules
   */
  readonly rules: Partial<Record<InstrumentableEffect, CombinatorFilter>>
}

/**
 * Options for auto-instrumentation with withSpan.
 *
 * @since 0.0.1
 * @category models
 */
export interface SpanInstrumentationOptions {
  /**
   * Enable auto-instrumentation with withSpan.
   * @default false
   */
  readonly enabled?: boolean | undefined
  /**
   * Effect combinators to instrument. Defaults to all supported combinators.
   */
  readonly include?: ReadonlyArray<InstrumentableEffect> | undefined
  /**
   * Effect combinators to exclude from instrumentation.
   */
  readonly exclude?: ReadonlyArray<InstrumentableEffect> | undefined
  /**
   * Span name format.
   * - "function": `effect.gen (fetchUser)` - combinator + function name (DEFAULT)
   * - "location": `effect.gen (index.ts:23)` - combinator + file:line
   * - "full": `effect.gen (fetchUser @ index.ts:23)` - all info
   * @default "function"
   */
  readonly nameFormat?: SpanNameFormat | undefined
  /**
   * Instrumentation strategy for fine-grained control.
   * - depth: Limit by nesting depth
   * - overrides: File/function filtering per combinator
   */
  readonly strategy?: DepthInstrumentationStrategy | OverrideInstrumentationStrategy | undefined
}

/**
 * Options for the source trace transformer plugin.
 *
 * @since 0.0.1
 * @category models
 */
export interface SourceTraceOptions {
  /**
   * Files to include in transformation. Defaults to TypeScript/JavaScript files.
   */
  readonly include?: FilterPattern | undefined
  /**
   * Files to exclude from transformation. Defaults to node_modules.
   */
  readonly exclude?: FilterPattern | undefined
  /**
   * Extract function name from yield* expression for the stack frame.
   * @default true
   */
  readonly extractFunctionName?: boolean | undefined
  /**
   * Enable yield* source tracing with CurrentStackFrame.
   * @default true
   */
  readonly sourceTrace?: boolean | undefined
  /**
   * Auto-instrumentation options for wrapping Effect combinators with withSpan.
   */
  readonly spans?: SpanInstrumentationOptions | undefined
}
