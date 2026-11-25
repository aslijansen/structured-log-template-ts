# structured-log-template-ts

Parses printf-style log format strings into literal segments and placeholder descriptors so structured loggers can emit named fields instead of pre-formatted strings.

```js
import { parseTemplate, formatTemplate, TemplateError } from "structured-log-template-ts";

const segments = parseTemplate("user=%(user)s id=%(id)d");
// [
//   { type: "literal", value: "user=" },
//   { type: "placeholder", name: "user", conversion: "s" },
//   { type: "literal", value: " id=" },
//   { type: "placeholder", name: "id", conversion: "d" },
// ]

formatTemplate("user=%(user)s id=%(id)d", { user: "ada", id: 7 });
// "user=ada id=7"
```

## Why this exists

Structured logging wants fields, but most logging call sites are written as format strings. Re-parsing those strings at every log call is wasteful, and re-implementing printf in each service produces subtly different grammars. This library does one small job: turn a template into a stable list of segments that a logger can compile once and reuse. The trade-off is strictness. An unknown conversion character or a malformed named placeholder throws `TemplateError` at parse time. That is deliberate: a typo in a template should fail when the logger is built, not silently produce a log line with the wrong field name.

## The awkward edge

Unnamed placeholders (`%s`, `%d`) are assigned to the values object in `Object.keys` order. If you mix named and unnamed placeholders, the unnamed ones still consume keys in insertion order, which is rarely what you want. Prefer named placeholders in real templates. Named placeholders may not be empty, and `%%` is the only way to emit a literal percent sign.

## API

- `parseTemplate(template: string)` returns an array of segments. Literal segments are `{ type: "literal", value: string }`. Placeholder segments are `{ type: "placeholder", name: string | null, conversion: "s" | "d" | "f" | "j" }`. A `null` name means the placeholder was unnamed.
- `formatTemplate(template: string, values: Record<string, unknown>)` returns a string. Named placeholders read their key from `values`; unnamed placeholders read keys in `Object.keys` order. `%d` requires an integer or bigint, `%f` requires a finite number, `%j` uses `JSON.stringify`.
- `TemplateError` is thrown for malformed templates and for values that do not match their conversion.
