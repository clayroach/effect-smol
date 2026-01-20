/**
 * Core source trace transformer for Effect.gen yield* expressions.
 *
 * @since 0.0.1
 */
import { parse } from "@babel/parser"
import * as _traverse from "@babel/traverse"
import * as _generate from "@babel/generator"
import * as t from "@babel/types"
import type { InstrumentableEffect, SourceTraceOptions, SpanInstrumentationOptions } from "./types.ts"

type NodePath<T = t.Node> = _traverse.NodePath<T>

type GenerateFn = (
  ast: t.Node,
  opts: _generate.GeneratorOptions,
  code?: string | { [filename: string]: string }
) => _generate.GeneratorResult

// Handle CommonJS default exports - runtime interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse: (ast: t.Node, opts: _traverse.TraverseOptions) => void = (_traverse as any).default ?? _traverse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate: GenerateFn = (_generate as any).default ?? _generate

interface StackFrameInfo {
  readonly name: string
  readonly location: string
  readonly varName: string
}

const ALL_INSTRUMENTABLE: ReadonlyArray<InstrumentableEffect> = [
  "gen", "fork", "forkDaemon", "forkScoped", "all", "forEach", "filter", "reduce", "iterate", "loop"
]

/**
 * Resolves which Effect combinators should be instrumented with spans.
 */
function resolveInstrumentable(options: SpanInstrumentationOptions): Set<string> {
  const include = options.include ?? ALL_INSTRUMENTABLE
  const exclude = new Set(options.exclude ?? [])
  return new Set(include.filter((name) => !exclude.has(name)))
}

/**
 * @since 0.0.1
 * @category models
 */
export interface TransformResult {
  readonly code: string
  readonly map?: unknown
  readonly transformed: boolean
}

/**
 * Determines if a call expression is Effect.gen() or a named import gen().
 */
function isEffectGenCall(
  node: t.CallExpression,
  effectImportName: string | null,
  genImportName: string | null
): boolean {
  const callee = node.callee

  // Effect.gen(...)
  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object) &&
    callee.object.name === effectImportName &&
    t.isIdentifier(callee.property) &&
    callee.property.name === "gen"
  ) {
    return true
  }

  // gen(...) from named import
  if (t.isIdentifier(callee) && callee.name === genImportName) {
    return true
  }

  return false
}

/**
 * Extracts function name from a yield* argument expression.
 */
function extractFunctionName(node: t.Expression): string {
  // foo()
  if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
    return node.callee.name
  }

  // obj.method()
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property)
  ) {
    return node.callee.property.name
  }

  // Effect.succeed(...)
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    t.isIdentifier(node.callee.property)
  ) {
    return `${node.callee.object.name}.${node.callee.property.name}`
  }

  return "unknown"
}

/**
 * Creates a hoisted StackFrame variable declaration.
 */
function createStackFrameDeclaration(info: StackFrameInfo): t.VariableDeclaration {
  return t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier(info.varName),
      t.objectExpression([
        t.objectProperty(t.identifier("name"), t.stringLiteral(info.name)),
        t.objectProperty(
          t.identifier("stack"),
          t.arrowFunctionExpression([], t.stringLiteral(info.location))
        ),
        t.objectProperty(t.identifier("parent"), t.identifier("undefined"))
      ])
    )
  ])
}

/**
 * Wraps a yield* argument with Effect.updateService.
 */
function wrapWithUpdateService(
  argument: t.Expression,
  frameVarName: string,
  effectImportName: string,
  referencesImportName: string
): t.CallExpression {
  return t.callExpression(
    t.memberExpression(t.identifier(effectImportName), t.identifier("updateService")),
    [
      argument,
      t.memberExpression(t.identifier(referencesImportName), t.identifier("CurrentStackFrame")),
      t.arrowFunctionExpression(
        [t.identifier("parent")],
        t.objectExpression([
          t.spreadElement(t.identifier(frameVarName)),
          t.objectProperty(t.identifier("parent"), t.identifier("parent"))
        ])
      )
    ]
  )
}

/**
 * Gets the variable name from a variable declarator parent.
 */
function getAssignedVariableName(path: NodePath<t.CallExpression>): string | null {
  const parent = path.parent
  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
    return parent.id.name
  }
  return null
}

/**
 * Creates a span name from variable name or location.
 */
function createSpanName(variableName: string | null, fileName: string, line: number): string {
  if (variableName) {
    return `${variableName} (${fileName}:${line})`
  }
  return `${fileName}:${line}`
}

/**
 * Wraps an expression with Effect.withSpan().
 */
function wrapWithSpan(
  expr: t.Expression,
  spanName: string,
  effectImportName: string
): t.CallExpression {
  return t.callExpression(
    t.memberExpression(t.identifier(effectImportName), t.identifier("withSpan")),
    [expr, t.stringLiteral(spanName)]
  )
}

/**
 * Finds or creates the Effect namespace import name.
 */
function findOrGetEffectImport(ast: t.File): { effectName: string; genName: string | null } {
  let effectName: string | null = null
  let genName: string | null = null

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue
    if (node.source.value !== "effect") continue

    for (const specifier of node.specifiers) {
      // import * as Effect from "effect" or import { Effect } from "effect"
      if (t.isImportNamespaceSpecifier(specifier)) {
        effectName = specifier.local.name
      } else if (t.isImportSpecifier(specifier)) {
        const imported = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value
        if (imported === "Effect") {
          effectName = specifier.local.name
        } else if (imported === "gen") {
          genName = specifier.local.name
        }
      }
    }
  }

  return { effectName: effectName ?? "Effect", genName }
}

/**
 * Ensures References is imported from effect.
 */
function ensureReferencesImport(ast: t.File): string {
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue
    if (node.source.value !== "effect") continue

    for (const specifier of node.specifiers) {
      if (t.isImportSpecifier(specifier)) {
        const imported = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value
        if (imported === "References") {
          return specifier.local.name
        }
      }
    }

    // Add References to existing effect import
    node.specifiers.push(
      t.importSpecifier(t.identifier("References"), t.identifier("References"))
    )
    return "References"
  }

  // No effect import found - add one (unlikely scenario)
  const importDecl = t.importDeclaration(
    [t.importSpecifier(t.identifier("References"), t.identifier("References"))],
    t.stringLiteral("effect")
  )
  ast.program.body.unshift(importDecl)
  return "References"
}

/**
 * Extracts the filename from a full path.
 */
function getFileName(filePath: string): string {
  const parts = filePath.split("/")
  return parts[parts.length - 1] ?? filePath
}

/**
 * Transforms source code to inject source location tracing and span instrumentation.
 *
 * @since 0.0.1
 * @category transform
 */
export function transform(
  code: string,
  id: string,
  options: SourceTraceOptions = {}
): TransformResult {
  const enableSourceTrace = options.sourceTrace !== false
  const extractFnName = options.extractFunctionName !== false
  const spanOptions = options.spans
  const enableSpans = spanOptions?.enabled === true

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

  const { effectName, genName } = findOrGetEffectImport(ast)

  // No Effect import found
  if (!effectName && !genName) {
    return { code, transformed: false }
  }

  let hasTransformed = false
  const fileName = getFileName(id)

  // Span instrumentation pass
  if (enableSpans && effectName) {
    const instrumentable = resolveInstrumentable(spanOptions!)
    const wrappedNodes = new WeakSet<t.CallExpression>()

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (wrappedNodes.has(path.node)) return

        const callee = path.node.callee
        if (!t.isMemberExpression(callee)) return
        if (!t.isIdentifier(callee.object) || callee.object.name !== effectName) return
        if (!t.isIdentifier(callee.property)) return

        const methodName = callee.property.name
        if (!instrumentable.has(methodName)) return

        const loc = path.node.loc
        if (!loc) return

        const variableName = getAssignedVariableName(path)
        const spanName = createSpanName(variableName, fileName, loc.start.line)

        const wrapped = wrapWithSpan(path.node, spanName, effectName)
        wrappedNodes.add(path.node)
        path.replaceWith(wrapped)
        hasTransformed = true
      }
    })
  }

  // Source trace pass
  if (enableSourceTrace) {
    const framesByLocation = new Map<string, StackFrameInfo>()
    let frameCounter = 0

    // First pass: collect all yield* locations and create frame info
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (!isEffectGenCall(path.node, effectName, genName)) return

        const generatorArg = path.node.arguments[0]
        if (!t.isFunctionExpression(generatorArg) || !generatorArg.generator) return

        path.traverse({
          // Skip nested Effect.gen calls to avoid processing their yield* twice
          CallExpression(nestedPath: NodePath<t.CallExpression>) {
            if (isEffectGenCall(nestedPath.node, effectName, genName)) {
              nestedPath.skip()
            }
          },
          YieldExpression(yieldPath: NodePath<t.YieldExpression>) {
            // Only process yield* (delegate)
            if (!yieldPath.node.delegate || !yieldPath.node.argument) return

            const loc = yieldPath.node.loc
            if (!loc) return

            const location = `${id}:${loc.start.line}:${loc.start.column}`

            if (!framesByLocation.has(location)) {
              const name = extractFnName
                ? extractFunctionName(yieldPath.node.argument)
                : "effect"
              const varName = `_sf${frameCounter++}`
              const info: StackFrameInfo = { name, location, varName }
              framesByLocation.set(location, info)
            }
          }
        })
      }
    })

    if (framesByLocation.size > 0) {
      const referencesName = ensureReferencesImport(ast)

      // Second pass: wrap yield* expressions
      traverse(ast, {
        CallExpression(path: NodePath<t.CallExpression>) {
          if (!isEffectGenCall(path.node, effectName, genName)) return

          const generatorArg = path.node.arguments[0]
          if (!t.isFunctionExpression(generatorArg) || !generatorArg.generator) return

          path.traverse({
            // Skip nested Effect.gen calls to avoid processing their yield* twice
            CallExpression(nestedPath: NodePath<t.CallExpression>) {
              if (isEffectGenCall(nestedPath.node, effectName, genName)) {
                nestedPath.skip()
              }
            },
            YieldExpression(yieldPath: NodePath<t.YieldExpression>) {
              if (!yieldPath.node.delegate || !yieldPath.node.argument) return

              const loc = yieldPath.node.loc
              if (!loc) return

              const location = `${id}:${loc.start.line}:${loc.start.column}`
              const frame = framesByLocation.get(location)
              if (!frame) return

              const wrapped = wrapWithUpdateService(
                yieldPath.node.argument,
                frame.varName,
                effectName!,
                referencesName
              )
              yieldPath.node.argument = wrapped
              hasTransformed = true
            }
          })
        }
      })

      // Insert hoisted frame declarations after imports
      const frameDeclarations = Array.from(framesByLocation.values()).map(createStackFrameDeclaration)
      let insertIndex = 0
      for (let i = 0; i < ast.program.body.length; i++) {
        if (!t.isImportDeclaration(ast.program.body[i])) {
          insertIndex = i
          break
        }
        insertIndex = i + 1
      }
      ast.program.body.splice(insertIndex, 0, ...frameDeclarations)
    }
  }

  if (!hasTransformed) {
    return { code, transformed: false }
  }

  const result = generate(ast, {
    sourceMaps: true,
    sourceFileName: id
  }, code)

  return {
    code: result.code,
    map: result.map,
    transformed: true
  }
}
