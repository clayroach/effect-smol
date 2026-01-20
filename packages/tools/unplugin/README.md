# @clayroach/effect-unplugin

Build-time AST transformer for Effect source location tracing and automatic span instrumentation.

## Features

- **Source Tracing**: Transforms `yield*` expressions inside `Effect.gen()` to inject stack frame information
- **Span Instrumentation**: Auto-wraps Effect combinators with `Effect.withSpan()` for distributed tracing
- **OpenTelemetry Semantic Conventions**: Adds `code.filepath`, `code.lineno`, `code.column`, `code.function` attributes
- **Configurable Span Names**: Three formats - function-based, location-based, or full
- **Granular Control**: Depth-based or override-based filtering strategies

## Installation

```bash
pnpm add -D @clayroach/effect-unplugin
```

## Quick Start

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import effectPlugin from '@clayroach/effect-unplugin/vite'

export default defineConfig({
  plugins: [
    effectPlugin({
      sourceTrace: true,
      spans: { enabled: true }
    })
  ]
})
```

### ESBuild

```typescript
import effectPlugin from '@clayroach/effect-unplugin/esbuild'
import { build } from 'esbuild'

build({
  plugins: [effectPlugin({ sourceTrace: true, spans: { enabled: true } })],
  // ... other options
})
```

### Webpack / Rollup

```typescript
import effectPlugin from '@clayroach/effect-unplugin/webpack'
// or
import effectPlugin from '@clayroach/effect-unplugin/rollup'
```

## Configuration

### Basic Options

```typescript
effectPlugin({
  // Enable source tracing for yield* expressions (default: true)
  sourceTrace: true,

  // Extract function names from yield* arguments (default: true)
  extractFunctionName: true,

  // File patterns to include (default: .js, .ts, .jsx, .tsx)
  include: /\.[jt]sx?$/,

  // File patterns to exclude (default: node_modules)
  exclude: /node_modules/,

  // Span instrumentation options
  spans: {
    enabled: true,
    include: ["gen", "fork", "all", "forEach"],
    nameFormat: "function"  // "function" | "location" | "full"
  }
})
```

### Span Name Formats

Control how span names appear in traces:

**`"function"` (default)**: Use function/variable names
```
effect.gen (fetchUser)
effect.all
effect.forEach (processItems)
```

**`"location"`: Use file locations
```
effect.gen (index.ts:23)
effect.all (index.ts:49)
effect.forEach (index.ts:59)
```

**`"full"`: Include both
```
effect.gen (fetchUser @ index.ts:23)
effect.all (index.ts:49)
effect.forEach (processItems @ index.ts:59)
```

All formats include full source location in span attributes (`code.filepath`, `code.lineno`, etc.)

## Instrumentation Strategies

Reduce overhead with fine-grained control over which Effect calls get instrumented.

### Depth Strategy

Limit instrumentation by nesting depth:

```typescript
spans: {
  enabled: true,
  strategy: {
    type: "depth",
    maxDepth: 2  // 0 = top-level only, 1 = one level deep, etc.
  }
}
```

**Per-combinator depth limits:**
```typescript
spans: {
  enabled: true,
  strategy: {
    type: "depth",
    perCombinator: {
      fork: 0,        // Only top-level forks
      gen: 1,         // Gen + one level deep
      all: Infinity   // No limit on Effect.all
    }
  }
}
```

### Override Strategy

Filter by file patterns and function names:

```typescript
spans: {
  enabled: true,
  strategy: {
    type: "overrides",
    rules: {
      // Only instrument forks in worker files
      fork: {
        files: "src/workers/**"
      },
      // Skip gen in tests and private functions
      gen: {
        excludeFiles: "**/*.test.ts",
        excludeFunctions: "^_.*"
      },
      // Only instrument forEach in API handlers
      forEach: {
        files: ["src/api/**", "src/handlers/**"],
        functions: "^handle.*"
      }
    }
  }
}
```

**Filter Options:**
- `files`: Glob patterns to include (single string or array)
- `excludeFiles`: Glob patterns to exclude
- `functions`: Regex patterns for function names to include
- `excludeFunctions`: Regex patterns for function names to exclude

## Examples

### Example 1: Reduce Fork Overhead

Only instrument top-level forks to avoid noisy background task traces:

```typescript
spans: {
  enabled: true,
  strategy: {
    type: "depth",
    perCombinator: {
      fork: 0,
      forkDaemon: 0,
      forkScoped: 0
    }
  }
}
```

### Example 2: Production-Only Instrumentation

Skip instrumentation in tests and development utilities:

```typescript
spans: {
  enabled: true,
  strategy: {
    type: "overrides",
    rules: {
      gen: {
        excludeFiles: [
          "**/*.test.ts",
          "**/__tests__/**",
          "src/dev/**"
        ]
      }
    }
  }
}
```

### Example 3: Selective High-Value Traces

Only instrument critical paths:

```typescript
spans: {
  enabled: true,
  strategy: {
    type: "overrides",
    rules: {
      gen: {
        files: [
          "src/api/**",
          "src/workers/**",
          "src/processors/**"
        ]
      },
      fork: {
        files: "src/workers/**",
        functions: "^(background|worker).*"
      }
    }
  }
}
```

## How It Works

### Source Tracing

Transforms:
```typescript
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching ${id}`)
    return { id, name: `User ${id}` }
  })
```

Into:
```typescript
const _sf0 = { name: "log", stack: () => "index.ts:3:4", parent: undefined }

const fetchUser = (id: string) =>
  Effect.gen(function* () {
    yield* Effect.updateService(
      Console.log(`Fetching ${id}`),
      References.CurrentStackFrame,
      (parent) => ({ ..._sf0, parent })
    )
    return { id, name: `User ${id}` }
  })
```

### Span Instrumentation

Transforms:
```typescript
const program = Effect.gen(function* () {
  const users = yield* Effect.all([
    fetchUser('alice'),
    fetchUser('bob')
  ])
})
```

Into:
```typescript
const program = Effect.withSpan(
  Effect.gen(function* () {
    const users = yield* Effect.withSpan(
      Effect.all([fetchUser('alice'), fetchUser('bob')]),
      "effect.all",
      {
        attributes: {
          "code.filepath": "src/index.ts",
          "code.lineno": 5,
          "code.column": 23,
          "code.function": "effect.all"
        }
      }
    )
  }),
  "effect.gen (program)",
  {
    attributes: {
      "code.filepath": "src/index.ts",
      "code.lineno": 3,
      "code.column": 16,
      "code.function": "program"
    }
  }
)
```

## Supported Combinators

- `gen` - Effect.gen()
- `fork` - Effect.fork()
- `forkDaemon` - Effect.forkDaemon()
- `forkScoped` - Effect.forkScoped()
- `all` - Effect.all()
- `forEach` - Effect.forEach()
- `filter` - Effect.filter()
- `reduce` - Effect.reduce()
- `iterate` - Effect.iterate()
- `loop` - Effect.loop()

## API Reference

### SourceTraceOptions

```typescript
interface SourceTraceOptions {
  include?: string | RegExp | Array<string | RegExp>
  exclude?: string | RegExp | Array<string | RegExp>
  sourceTrace?: boolean
  extractFunctionName?: boolean
  spans?: SpanInstrumentationOptions
}
```

### SpanInstrumentationOptions

```typescript
interface SpanInstrumentationOptions {
  enabled?: boolean
  include?: Array<InstrumentableEffect>
  exclude?: Array<InstrumentableEffect>
  nameFormat?: "function" | "location" | "full"
  strategy?: DepthInstrumentationStrategy | OverrideInstrumentationStrategy
}
```

### DepthInstrumentationStrategy

```typescript
interface DepthInstrumentationStrategy {
  type: "depth"
  maxDepth?: number
  perCombinator?: Partial<Record<InstrumentableEffect, number>>
}
```

### OverrideInstrumentationStrategy

```typescript
interface OverrideInstrumentationStrategy {
  type: "overrides"
  rules: Partial<Record<InstrumentableEffect, CombinatorFilter>>
}

interface CombinatorFilter {
  files?: string | Array<string>
  excludeFiles?: string | Array<string>
  functions?: string | Array<string>      // Regex patterns
  excludeFunctions?: string | Array<string>  // Regex patterns
}
```

## License

MIT
