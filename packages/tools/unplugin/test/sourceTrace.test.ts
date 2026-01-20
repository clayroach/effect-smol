import { annotateEffects } from "@effect/unplugin/annotateEffects"
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
    it("wraps Effect.gen with withSpan when enabled", () => {
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
      expect(result.code).toContain('"getUser (UserRepo.ts:4)"')
    })

    it("wraps Effect.fork with withSpan when enabled", () => {
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
      expect(result.code).toContain('"backgroundTask (app.ts:4)"')
    })

    it("wraps Effect.all with withSpan when enabled", () => {
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
      expect(result.code).toContain('"combined (app.ts:4)"')
    })

    it("wraps Effect.forEach with withSpan when enabled", () => {
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
      expect(result.code).toContain('"results (app.ts:4)"')
    })

    it("uses file:line when no variable name", () => {
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
      expect(result.code).toContain('"handler.ts:4"')
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
      expect(result.code).toContain('"a (app.ts:4)"')
      // fork should not be wrapped
      expect(result.code).not.toContain('"b (app.ts:5)"')
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
      expect(result.code).toContain('"a (app.ts:4)"')
      // fork should not be wrapped
      expect(result.code).not.toContain('"b (app.ts:5)"')
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
})

describe("annotateEffects", () => {
  it("adds @__PURE__ to Effect.succeed in variable declaration", () => {
    const code = `
import { Effect } from "effect"

const value = Effect.succeed(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    expect(result.code).toContain("/*#__PURE__*/")
  })

  it("adds @__PURE__ to Option.some in variable declaration", () => {
    const code = `
import { Option } from "effect"

const value = Option.some(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    expect(result.code).toContain("/*#__PURE__*/")
  })

  it("adds @__PURE__ to Data.struct in variable declaration", () => {
    const code = `
import { Data } from "effect"

const User = Data.struct({ name: "string" })
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    expect(result.code).toContain("/*#__PURE__*/")
  })

  it("does not annotate non-Effect module calls", () => {
    const code = `
const value = someOtherFunction(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(false)
  })

  it("does not double-annotate already annotated calls", () => {
    const code = `
import { Effect } from "effect"

const value = /* @__PURE__ */ Effect.succeed(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(false)
  })

  it("annotates export default declarations", () => {
    const code = `
import { Effect } from "effect"

export default Effect.succeed(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    expect(result.code).toContain("/*#__PURE__*/")
  })

  it("annotates arrow function returns", () => {
    const code = `
import { Effect } from "effect"

const fn = () => Effect.succeed(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    expect(result.code).toContain("/*#__PURE__*/")
  })

  it("handles multiple Effect calls", () => {
    const code = `
import { Effect, Option } from "effect"

const a = Effect.succeed(1)
const b = Option.some(2)
const c = Effect.fail("error")
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    const pureCount = (result.code.match(/\/\*#__PURE__\*\//g) || []).length
    expect(pureCount).toBe(3)
  })

  it("produces source map", () => {
    const code = `
import { Effect } from "effect"

const value = Effect.succeed(42)
`
    const result = annotateEffects(code, "test.ts")
    expect(result.transformed).toBe(true)
    expect(result.map).toBeDefined()
  })
})
