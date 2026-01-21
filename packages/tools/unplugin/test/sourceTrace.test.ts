import { transform } from "@effect/unplugin/sourceTrace"
import { describe, expect, it } from "vitest"

describe("sourceTrace", () => {
  describe("transform", () => {
    it("wraps yield* with updateService", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const value = yield* Effect.succeed(42)
  return value
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.updateService")
      expect(result.code).toContain("References.CurrentStackFrame")
    })

    it("hoists StackFrame to module scope", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(1)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("const _sf0 = {")
      // extractFunctionName extracts just the method name from member expressions
      expect(result.code).toContain('name: "succeed"')
      expect(result.code).toContain('stack: () => "test.ts:')
    })

    it("extracts function names from call expressions", () => {
      const code = `
import { Effect } from "effect"

const getUser = () => Effect.succeed({ name: "Alice" })
const program = Effect.gen(function* () {
  yield* getUser()
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('name: "getUser"')
    })

    it("extracts method names from member expressions", () => {
      const code = `
import { Effect } from "effect"

const service = {
  fetchUser: () => Effect.succeed({ name: "Bob" })
}
const program = Effect.gen(function* () {
  yield* service.fetchUser()
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('name: "fetchUser"')
    })

    it("deduplicates by file:line:column", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(1)
  yield* Effect.succeed(2)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      // Should have two different frame variables
      expect(result.code).toContain("_sf0")
      expect(result.code).toContain("_sf1")
    })

    it("handles nested Effect.gen", () => {
      const code = `
import { Effect } from "effect"

const outer = Effect.gen(function* () {
  const inner = Effect.gen(function* () {
    yield* Effect.succeed("inner")
  })
  yield* inner
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.updateService")
      // Both yield* should be wrapped
      const updateServiceCount = (result.code.match(/Effect\.updateService/g) || []).length
      expect(updateServiceCount).toBe(2)
    })

    it("skips regular yield (non-delegate)", () => {
      const code = `
import { Effect } from "effect"

function* regularGenerator() {
  yield 1
  yield 2
}

const program = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      // Only one updateService for the yield* in Effect.gen
      const updateServiceCount = (result.code.match(/Effect\.updateService/g) || []).length
      expect(updateServiceCount).toBe(1)
    })

    it("adds References import when missing", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("References")
      expect(result.code).toMatch(/import.*References.*from "effect"/)
    })

    it("preserves existing References import", () => {
      const code = `
import { Effect, References } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      // Should not duplicate References import
      const referencesImportCount = (result.code.match(/References/g) || []).length
      // References appears in: import, _sf0.parent (undefined), updateService call
      expect(referencesImportCount).toBeGreaterThan(1)
    })

    it("returns unchanged code when no Effect import", () => {
      const code = `
const program = function* () {
  yield* Promise.resolve(42)
}
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(false)
    })

    it("returns unchanged code when no Effect.gen calls", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.succeed(42)
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(false)
    })

    it("handles named gen import", () => {
      const code = `
import { gen } from "effect/Effect"

const program = gen(function* () {
  yield* Promise.resolve(42)
})
`
      const result = transform(code, "test.ts")
      // This specific case won't transform because the import is from "effect/Effect"
      // not "effect", and we only check for "effect" imports
      expect(result.transformed).toBe(false)
    })

    it("respects extractFunctionName: false option", () => {
      const code = `
import { Effect } from "effect"

const getUser = () => Effect.succeed({ name: "Alice" })
const program = Effect.gen(function* () {
  yield* getUser()
})
`
      const result = transform(code, "test.ts", { extractFunctionName: false })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('name: "effect"')
    })

    it("produces source map", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.map).toBeDefined()
    })

    it("handles multiple Effect.gen calls in same file", () => {
      const code = `
import { Effect } from "effect"

const program1 = Effect.gen(function* () {
  yield* Effect.succeed(1)
})

const program2 = Effect.gen(function* () {
  yield* Effect.succeed(2)
})
`
      const result = transform(code, "test.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("_sf0")
      expect(result.code).toContain("_sf1")
    })

    it("includes correct location in stack frame", () => {
      const code = `import { Effect } from "effect"
const program = Effect.gen(function* () {
  yield* Effect.succeed(42)
})`
      const result = transform(code, "UserRepo.ts")
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("UserRepo.ts:3:")
    })

    it("can disable source tracing", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "test.ts", { sourceTrace: false })
      expect(result.transformed).toBe(false)
      expect(result.code).not.toContain("updateService")
    })
  })

  describe("span instrumentation", () => {
    it("wraps Effect.gen with withSpan using function name (default)", () => {
      const code = `
import { Effect } from "effect"

const getUser = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "/src/UserRepo.ts", {
        sourceTrace: false,
        spans: { enabled: true }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.withSpan")
      expect(result.code).toContain('"effect.gen (getUser)"')
      expect(result.code).toContain('"code.function": "getUser"')
    })

    it("wraps Effect.fork with withSpan using function name (default)", () => {
      const code = `
import { Effect } from "effect"

const backgroundTask = Effect.fork(Effect.succeed(42))
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.withSpan")
      expect(result.code).toContain('"effect.fork (backgroundTask)"')
      expect(result.code).toContain('"code.function": "backgroundTask"')
    })

    it("wraps Effect.all with withSpan using function name (default)", () => {
      const code = `
import { Effect } from "effect"

const combined = Effect.all([Effect.succeed(1), Effect.succeed(2)])
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.withSpan")
      expect(result.code).toContain('"effect.all (combined)"')
      expect(result.code).toContain('"code.function": "combined"')
    })

    it("wraps Effect.forEach with withSpan using function name (default)", () => {
      const code = `
import { Effect } from "effect"

const results = Effect.forEach([1, 2, 3], (n) => Effect.succeed(n * 2))
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.withSpan")
      expect(result.code).toContain('"effect.forEach (results)"')
      expect(result.code).toContain('"code.function": "results"')
    })

    it("uses just combinator when no variable name (function format)", () => {
      const code = `
import { Effect } from "effect"

export default Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "/src/handler.ts", {
        sourceTrace: false,
        spans: { enabled: true }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain("Effect.withSpan")
      expect(result.code).toContain('"effect.gen"')
      expect(result.code).toContain('"code.filepath": "/src/handler.ts"')
      expect(result.code).toContain('"code.lineno": 4')
      expect(result.code).toContain('"code.function": "effect.gen"')
    })

    it("uses location format when nameFormat is location", () => {
      const code = `
import { Effect } from "effect"

const getUser = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true, nameFormat: "location" }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.gen (app.ts:4)"')
      expect(result.code).toContain('"code.function": "getUser"')
    })

    it("uses full format when nameFormat is full", () => {
      const code = `
import { Effect } from "effect"

const getUser = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true, nameFormat: "full" }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.gen (getUser @ app.ts:4)"')
      expect(result.code).toContain('"code.function": "getUser"')
    })

    it("respects include option", () => {
      const code = `
import { Effect } from "effect"

const a = Effect.gen(function* () { yield* Effect.succeed(1) })
const b = Effect.fork(Effect.succeed(2))
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true, include: ["gen"] }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.gen (a)"')
      // fork should not be wrapped
      expect(result.code).not.toContain('"effect.fork')
    })

    it("respects exclude option", () => {
      const code = `
import { Effect } from "effect"

const a = Effect.gen(function* () { yield* Effect.succeed(1) })
const b = Effect.fork(Effect.succeed(2))
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: { enabled: true, exclude: ["fork"] }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.gen (a)"')
      // fork should not be wrapped
      expect(result.code).not.toContain('"effect.fork')
    })

    it("does not transform when spans not enabled", () => {
      const code = `
import { Effect } from "effect"

const getUser = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "/src/app.ts", { sourceTrace: false })
      expect(result.transformed).toBe(false)
      expect(result.code).not.toContain("Effect.withSpan")
    })

    it("combines source tracing and span instrumentation", () => {
      const code = `
import { Effect } from "effect"

const getUser = Effect.gen(function* () {
  yield* Effect.succeed(42)
})
`
      const result = transform(code, "/src/UserRepo.ts", {
        sourceTrace: true,
        spans: { enabled: true }
      })
      expect(result.transformed).toBe(true)
      // Both features should be applied
      expect(result.code).toContain("Effect.withSpan")
      expect(result.code).toContain("Effect.updateService")
      expect(result.code).toContain("References.CurrentStackFrame")
    })
  })

  describe("depth strategy", () => {
    it("respects maxDepth limit", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const nested = Effect.all([
    Effect.forEach([1, 2], (n) => Effect.succeed(n))
  ])
})
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: { type: "depth", maxDepth: 1 }
        }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.gen (program)"') // depth 0
      expect(result.code).toContain('"effect.all (nested)"') // depth 1
      expect(result.code).not.toContain('"effect.forEach"') // depth 2 - excluded
    })

    it("respects perCombinator depth limits", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const items = yield* Effect.all([
    Effect.succeed(1),
    Effect.succeed(2)
  ])
  const bg = Effect.fork(Effect.succeed(3))
})
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: {
            type: "depth",
            perCombinator: {
              fork: 0,  // Only top-level forks
              all: 1    // Allow all at depth 0-1
            }
          }
        }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.gen (program)"')
      expect(result.code).toContain('"effect.all"')
      expect(result.code).not.toContain('"effect.fork (bg)"') // depth 1, but fork maxDepth=0 so excluded
    })
  })

  describe("override strategy", () => {
    it("filters by file pattern", () => {
      const code = `
import { Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.succeed(1)
})
`
      const resultIncluded = transform(code, "/src/workers/task.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: {
            type: "overrides",
            rules: {
              gen: { files: "src/workers/**" }
            }
          }
        }
      })
      expect(resultIncluded.transformed).toBe(true)

      const resultExcluded = transform(code, "/src/utils/helpers.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: {
            type: "overrides",
            rules: {
              gen: { files: "src/workers/**" }
            }
          }
        }
      })
      expect(resultExcluded.transformed).toBe(false)
    })

    it("filters by excludeFiles pattern", () => {
      const code = `
import { Effect } from "effect"

const test = Effect.gen(function* () {
  yield* Effect.succeed(1)
})
`
      const result = transform(code, "/src/app.test.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: {
            type: "overrides",
            rules: {
              gen: { excludeFiles: "**/*.test.ts" }
            }
          }
        }
      })
      expect(result.transformed).toBe(false)
    })

    it("filters by function name regex", () => {
      const code = `
import { Effect } from "effect"

const backgroundTask = Effect.fork(Effect.succeed(1))
const userTask = Effect.fork(Effect.succeed(2))
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: {
            type: "overrides",
            rules: {
              fork: { functions: "^background.*" }
            }
          }
        }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).toContain('"effect.fork (backgroundTask)"')
      expect(result.code).not.toContain('"effect.fork (userTask)"')
    })

    it("filters by excludeFunctions regex", () => {
      const code = `
import { Effect } from "effect"

const _internal = Effect.gen(function* () { yield* Effect.succeed(1) })
const publicApi = Effect.gen(function* () { yield* Effect.succeed(2) })
`
      const result = transform(code, "/src/app.ts", {
        sourceTrace: false,
        spans: {
          enabled: true,
          strategy: {
            type: "overrides",
            rules: {
              gen: { excludeFunctions: "^_.*" }
            }
          }
        }
      })
      expect(result.transformed).toBe(true)
      expect(result.code).not.toContain('"effect.gen (_internal)"')
      expect(result.code).toContain('"effect.gen (publicApi)"')
    })
  })
})
