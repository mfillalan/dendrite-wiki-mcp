---
lifecycle: generated
source-coverage: api-reference
source-file: test/fixtures/api-extractor/sample.ts
last-generated: 2026-05-07T12:00:00.000Z
---

# `test/fixtures/api-extractor/sample.ts`

Sample input for the API reference extractor.

This file is parsed by the extractor in tests; it is not part of the project's
tsc build. It deliberately exercises every supported symbol kind and JSDoc tag.

## Exports

- [`greet`](#greet) — function
- [`Widget`](#widget) — class
- [`WidgetConfig`](#widgetconfig) — interface
- [`WidgetShape`](#widgetshape) — type alias
- [`Severity`](#severity) — enum
- [`DEFAULT_SHAPE`](#default-shape) — variable

---

### `greet`

**Kind:** function · **Source:** [test/fixtures/api-extractor/sample.ts:19](../../test/fixtures/api-extractor/sample.ts#L19)

```ts
function greet(input: string, times: number): string
```

A simple function used by the docs.

#### Parameters

| Name | Description |
|---|---|
| `input` | the raw value to greet |
| `times` | how many times to repeat the greeting |

#### Returns

the greeting string

#### Example

```ts
greet('world', 2);
// => 'hello world hello world'
```

**Since:** 0.1.0

---

### `Widget`

**Kind:** class · **Source:** [test/fixtures/api-extractor/sample.ts:28](../../test/fixtures/api-extractor/sample.ts#L28)

```ts
class Widget
```

A widget that does widget things.

#### See

- {@link greet}

---

### `WidgetConfig`

**Kind:** interface · **Source:** [test/fixtures/api-extractor/sample.ts:35](../../test/fixtures/api-extractor/sample.ts#L35)

```ts
interface WidgetConfig {
    name: string;
    enabled?: boolean;
}
```

Configuration for the {@link Widget} factory.

---

### `WidgetShape`

**Kind:** type alias · **Source:** [test/fixtures/api-extractor/sample.ts:43](../../test/fixtures/api-extractor/sample.ts#L43)

```ts
type WidgetShape = 'square' | 'circle' | 'triangle'
```

A union of supported widget shapes.

---

### `Severity`

> ⚠️ **Deprecated:** use the new SeverityV2 enum once it ships.

**Kind:** enum · **Source:** [test/fixtures/api-extractor/sample.ts:50](../../test/fixtures/api-extractor/sample.ts#L50)

```ts
enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}
```

Severity levels recognized by the system.

---

### `DEFAULT_SHAPE`

**Kind:** variable · **Source:** [test/fixtures/api-extractor/sample.ts:61](../../test/fixtures/api-extractor/sample.ts#L61)

```ts
const DEFAULT_SHAPE: WidgetShape
```

The default widget shape, exported as a constant.

#### Tags

- **@customTag**: this is an unknown tag and should be preserved verbatim
