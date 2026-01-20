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
  /**
   * Add @__PURE__  annotations to Effect calls for tree-shaking.
   * @default false
   */
  readonly annotateEffects?: boolean | undefined
}
