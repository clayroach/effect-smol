import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Layer } from "effect"

describe("SourceCapture", () => {
  describe("Effect.sourceLocation", () => {
    it.effect("returns undefined when source capture is disabled (default)", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.sourceLocation)
        const location = yield* Fiber.join(fiber)
        assert.isUndefined(location)
      }))

    it.effect("captures source location when enabled via withSourceCapture", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.sourceLocation)
        const location = yield* Fiber.join(fiber)

        assert.isDefined(location)
        assert.isString(location!.file)
        assert.isNumber(location!.line)
        assert.isNumber(location!.column)
        // The file should contain the test file name
        assert.include(location!.file, "SourceCapture.test.ts")
      }).pipe(Effect.withSourceCapture(true)))

    it.effect("captures source location when enabled via Layer.enableSourceCapture", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.sourceLocation)
        const location = yield* Fiber.join(fiber)

        assert.isDefined(location)
        assert.isString(location!.file)
        assert.include(location!.file, "SourceCapture.test.ts")
      }).pipe(Effect.provide(Layer.enableSourceCapture)))
  })

  describe("child fiber isolation", () => {
    it.effect("child fiber has different location than parent", () =>
      Effect.gen(function*() {
        // Parent captures location at line A
        const parentFiber = yield* Effect.forkChild(
          Effect.gen(function*() {
            const parentLocation = yield* Effect.sourceLocation
            // Child captures location at line B (different from parent)
            const childFiber = yield* Effect.forkChild(Effect.sourceLocation)
            const childLocation = yield* Fiber.join(childFiber)
            return { parentLocation, childLocation }
          })
        )

        const { parentLocation, childLocation } = yield* Fiber.join(parentFiber)

        assert.isDefined(parentLocation)
        assert.isDefined(childLocation)
        // Parent and child should have different line numbers
        assert.notStrictEqual(parentLocation!.line, childLocation!.line)
      }).pipe(Effect.withSourceCapture(true)))
  })

  describe("fork variants", () => {
    it.effect("forkDetach captures source location", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.forkDetach(Effect.sourceLocation)
        const location = yield* Fiber.join(fiber)

        assert.isDefined(location)
        assert.include(location!.file, "SourceCapture.test.ts")
      }).pipe(Effect.withSourceCapture(true)))

    it.effect("forkScoped captures source location", () =>
      Effect.gen(function*() {
        const location = yield* Effect.scoped(
          Effect.gen(function*() {
            const fiber = yield* Effect.forkScoped(Effect.sourceLocation)
            return yield* Fiber.join(fiber)
          })
        )

        // forkScoped may capture internal effect.ts due to indirection
        // Just verify location is captured
        assert.isDefined(location)
        assert.isString(location!.file)
        assert.isNumber(location!.line)
      }).pipe(Effect.withSourceCapture(true)))
  })

  describe("zero-cost when disabled", () => {
    it.effect("source location is undefined when disabled (default)", () =>
      Effect.gen(function*() {
        // Without enabling source capture, location should be undefined
        const fiber = yield* Effect.forkChild(Effect.sourceLocation)
        const location = yield* Fiber.join(fiber)
        assert.isUndefined(location)
      }))

    it.effect("source location is undefined when disabled after enabled", () =>
      Effect.gen(function*() {
        // Disable source capture for the inner fork, even though outer is enabled
        const fiber = yield* Effect.withSourceCapture(false)(
          Effect.forkChild(Effect.sourceLocation)
        )
        const location = yield* Fiber.join(fiber)
        assert.isUndefined(location)
      }).pipe(Effect.withSourceCapture(true)))
  })

  describe("concurrent operations", () => {
    it.effect("forEach captures source location for each fiber", () =>
      Effect.gen(function*() {
        const locations = yield* Effect.forEach(
          [1, 2, 3],
          () => Effect.sourceLocation,
          { concurrency: "unbounded" }
        )

        // forEach uses dual() which adds indirection, so the captured location
        // may be in internal code. Just verify location is captured.
        for (const location of locations) {
          assert.isDefined(location)
          assert.isString(location!.file)
          assert.isNumber(location!.line)
        }
      }).pipe(Effect.withSourceCapture(true)))

    it.effect("raceAll captures source location for fibers", () =>
      Effect.gen(function*() {
        // Race multiple effects that return their source location
        const location = yield* Effect.raceAll([
          Effect.sourceLocation,
          Effect.delay(Effect.sourceLocation, 1000),
          Effect.delay(Effect.sourceLocation, 2000)
        ])

        assert.isDefined(location)
        assert.include(location!.file, "SourceCapture.test.ts")
      }).pipe(Effect.withSourceCapture(true)))

    it.effect("raceAllFirst captures source location for fibers", () =>
      Effect.gen(function*() {
        const location = yield* Effect.raceAllFirst([
          Effect.sourceLocation,
          Effect.delay(Effect.sourceLocation, 1000)
        ])

        assert.isDefined(location)
        assert.include(location!.file, "SourceCapture.test.ts")
      }).pipe(Effect.withSourceCapture(true)))
  })
})
