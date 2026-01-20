/**
 * Effect tree-shaking annotations transformer.
 *
 * Adds `\/* @__PURE__ *\/` comments to Effect calls for bundler tree-shaking.
 *
 * @since 0.0.1
 */
import { parse } from "@babel/parser"
import * as _traverse from "@babel/traverse"
import * as _generate from "@babel/generator"
import * as t from "@babel/types"

type NodePath<T = t.Node> = _traverse.NodePath<T>

type GenerateFn = (
  ast: t.Node,
  opts: _generate.GeneratorOptions,
  code?: string | { [filename: string]: string }
) => _generate.GeneratorResult

type TraverseFn = (ast: t.Node, opts: _traverse.TraverseOptions) => void

// Handle CommonJS/ESM interop for babel packages
// Babel packages can be imported as ESM or CJS with varying module structures
type BabelModule<T> =
  | T
  | { default: T }
  | { default: { default: T } }

function extractBabelExport<T>(module: BabelModule<T>): T {
  // Check if module is directly the export (ESM)
  if (typeof module === "function") {
    return module
  }
  // Check for CJS default export
  const moduleAsRecord = module as Record<string, unknown>
  if (moduleAsRecord.default !== undefined) {
    if (typeof moduleAsRecord.default === "function") {
      return moduleAsRecord.default as T
    }
    // Check for double-wrapped default (CJS -> ESM -> CJS)
    const defaultAsRecord = moduleAsRecord.default as Record<string, unknown>
    if (defaultAsRecord?.default !== undefined) {
      return defaultAsRecord.default as T
    }
  }
  return module as T
}

const traverse: TraverseFn = extractBabelExport<TraverseFn>(_traverse as BabelModule<TraverseFn>)
const generate: GenerateFn = extractBabelExport<GenerateFn>(_generate as BabelModule<GenerateFn>)

/**
 * Effect module names that should have pure annotations.
 */
const EFFECT_MODULES = new Set([
  "Effect",
  "Option",
  "Either",
  "Data",
  "Schema",
  "Array",
  "Chunk",
  "HashMap",
  "HashSet",
  "List",
  "Queue",
  "Stream",
  "Layer",
  "Scope",
  "Ref",
  "SynchronizedRef",
  "SubscriptionRef",
  "Duration",
  "Schedule",
  "Cause",
  "Exit",
  "Match",
  "Boolean",
  "Number",
  "String",
  "Struct",
  "Tuple",
  "Function",
  "Predicate",
  "Order",
  "Equivalence",
  "Context",
  "Brand",
  "Types"
])

/**
 * @since 0.0.1
 * @category models
 */
export interface AnnotateResult {
  readonly code: string
  readonly map?: unknown
  readonly transformed: boolean
}

/**
 * Checks if a call expression already has a pure annotation.
 */
function hasPureAnnotation(node: t.CallExpression): boolean {
  const comments = node.leadingComments
  if (!comments) return false
  return comments.some(
    (comment) =>
      comment.type === "CommentBlock" &&
      (comment.value.includes("@__PURE__") || comment.value.includes("#__PURE__"))
  )
}

/**
 * Checks if a call is to an Effect module method.
 */
function isEffectModuleCall(node: t.CallExpression): boolean {
  const callee = node.callee

  // Effect.succeed(...) or Option.some(...)
  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object) &&
    EFFECT_MODULES.has(callee.object.name)
  ) {
    return true
  }

  return false
}

/**
 * Checks if a CallExpression is in a context where pure annotation is useful.
 * Only annotate calls in variable declarations or export declarations.
 */
function isInAnnotatableContext(path: NodePath<t.CallExpression>): boolean {
  let parent: NodePath | null = path.parentPath

  while (parent !== null) {
    const node = parent.node

    // Variable declaration: const x = Effect.succeed(...)
    if (t.isVariableDeclarator(node)) {
      return true
    }

    // Export: export const x = Effect.succeed(...)
    if (t.isExportDefaultDeclaration(node) || t.isExportNamedDeclaration(node)) {
      return true
    }

    // Return statement: return Effect.succeed(...)
    if (t.isReturnStatement(node)) {
      return true
    }

    // Arrow function body: () => Effect.succeed(...)
    if (t.isArrowFunctionExpression(node)) {
      return true
    }

    // Stop at block statements
    if (t.isBlockStatement(node) || t.isProgram(node)) {
      break
    }

    parent = parent.parentPath
  }

  return false
}

/**
 * Transforms source code to add pure annotations to Effect calls.
 *
 * @since 0.0.1
 * @category transform
 */
export function annotateEffects(code: string, id: string): AnnotateResult {
  let ast: t.File
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      sourceFilename: id
    })
  } catch {
    return { code, transformed: false }
  }

  let hasTransformed = false

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      // Skip if already has pure annotation
      if (hasPureAnnotation(path.node)) return

      // Only annotate Effect module calls
      if (!isEffectModuleCall(path.node)) return

      // Only annotate in useful contexts
      if (!isInAnnotatableContext(path)) return

      // Add @__PURE__ annotation
      t.addComment(path.node, "leading", "#__PURE__", false)
      hasTransformed = true
    }
  })

  if (!hasTransformed) {
    return { code, transformed: false }
  }

  const result = generate(ast, {
    sourceMaps: true,
    sourceFileName: id,
    comments: true
  }, code)

  return {
    code: result.code,
    map: result.map,
    transformed: true
  }
}
