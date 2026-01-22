import type * as References from "../References.ts"
import type * as Tracer from "../Tracer.ts"

export interface ErrorWithStackTraceLimit {
  stackTraceLimit?: number | undefined
}

// ----------------------------------------------------------------------------
// Source Location Parsing with FIFO Cache
// ----------------------------------------------------------------------------

const SOURCE_LOCATION_CACHE_MAX_SIZE = 1000
const sourceLocationCache = new Map<string, References.SourceLocation | undefined>()

/** @internal */
export const parseSourceLocation = (
  rawStack: string,
  skipFrames = 3
): References.SourceLocation | undefined => {
  const cacheKey = `${skipFrames}:${rawStack}`
  if (sourceLocationCache.has(cacheKey)) {
    return sourceLocationCache.get(cacheKey)
  }

  const lines = rawStack.split("\n")
  const frame = lines[skipFrames]?.trim()
  if (!frame) {
    sourceLocationCache.set(cacheKey, undefined)
    return undefined
  }

  // Parse V8-style stack frame:
  // "at functionName (file:line:column)" or "at file:line:column"
  const match = frame.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/)
  if (!match) {
    sourceLocationCache.set(cacheKey, undefined)
    return undefined
  }

  const location: References.SourceLocation = {
    file: match[2],
    line: parseInt(match[3], 10),
    column: parseInt(match[4], 10),
    ...(match[1] ? { functionName: match[1] } : {})
  }

  // FIFO eviction if cache is full
  if (sourceLocationCache.size >= SOURCE_LOCATION_CACHE_MAX_SIZE) {
    const firstKey = sourceLocationCache.keys().next().value
    if (firstKey !== undefined) {
      sourceLocationCache.delete(firstKey)
    }
  }
  sourceLocationCache.set(cacheKey, location)

  return location
}

/** @internal */
export const captureRawStack = (): string | undefined => new Error().stack

/** @internal */
export const addSpanStackTrace = <A extends Tracer.TraceOptions>(
  options: A | undefined
): A => {
  if (options?.captureStackTrace === false) {
    return options
  } else if (options?.captureStackTrace !== undefined && typeof options.captureStackTrace !== "boolean") {
    return options
  }
  const limit = (Error as ErrorWithStackTraceLimit).stackTraceLimit
  ;(Error as ErrorWithStackTraceLimit).stackTraceLimit = 3
  const traceError = new Error()
  ;(Error as ErrorWithStackTraceLimit).stackTraceLimit = limit
  return {
    ...options,
    captureStackTrace: spanCleaner(() => traceError.stack)
  } as A
}

/** @internal */
export const makeStackCleaner = (line: number) => (stack: () => string | undefined): () => string | undefined => {
  let cache: string | undefined
  return () => {
    if (cache !== undefined) return cache
    const trace = stack()
    if (!trace) return undefined
    const lines = trace.split("\n")
    if (lines[line] !== undefined) {
      cache = lines[line].trim()
      return cache
    }
  }
}

const spanCleaner = makeStackCleaner(3)
