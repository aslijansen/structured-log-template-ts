"use strict";

/**
 * Structured Log Template Parser.
 *
 * Parses printf-style log format strings into literal segments and placeholder
 * descriptors. This module deliberately keeps the grammar small: a template is
 * a sequence of literal text and `%` placeholders. The supported placeholder
 * forms are:
 *
 *   %%            -> a literal percent sign
 *   %s            -> a string placeholder named ""
 *   %d            -> an integer placeholder named ""
 *   %f            -> a float placeholder named ""
 *   %j            -> a JSON placeholder named ""
 *   %(name)s      -> a string placeholder named "name"
 *   %(name)d      -> an integer placeholder named "name"
 *   %(name)f      -> a float placeholder named "name"
 *   %(name)j      -> a JSON placeholder named "name"
 *
 * The parser is intentionally strict. An unrecognised conversion character or a
 * malformed named placeholder throws a TemplateError rather than being treated
 * as literal text. That choice is what makes the output safe to hand to a
 * structured logger: a typo in a template fails at startup instead of silently
 * producing a log line with the wrong field.
 */

export class TemplateError extends Error {
  /**
   * @param {string} message
   * @param {number} [index] character offset in the source template
   */
  constructor(message, index) {
    super(index === undefined ? message : `${message} at index ${index}`);
    this.name = "TemplateError";
    if (index !== undefined) {
      this.index = index;
    }
  }
}

const CONVERSIONS = new Set(["s", "d", "f", "j"]);

/**
 * Parse a template string into a flat array of segments.
 *
 * Literal segments have shape `{ type: "literal", value: string }`.
 * Placeholder segments have shape `{ type: "placeholder", name: string|null, conversion: string }`.
 *
 * A `null` name means the placeholder was unnamed (`%s`). An empty string is a
 * legal name only for the `%%` escape, which is emitted as a literal segment,
 * not a placeholder.
 *
 * @param {string} template
 * @returns {Array<{type: "literal", value: string}|{type: "placeholder", name: string|null, conversion: string}>}
 */
export function parseTemplate(template) {
  if (typeof template !== "string") {
    throw new TemplateError("template must be a string");
  }

  const segments = [];
  let literalStart = 0;
  let i = 0;

  const flushLiteral = (end) => {
    if (end > literalStart) {
      segments.push({ type: "literal", value: template.slice(literalStart, end) });
    }
  };

  while (i < template.length) {
    const ch = template[i];
    if (ch !== "%") {
      i += 1;
      continue;
    }

    // We are at a `%`. Decide what follows.
    if (i + 1 >= template.length) {
      throw new TemplateError("dangling '%' at end of template", i);
    }

    const next = template[i + 1];

    if (next === "%") {
      // `%%` is an escape for a literal percent sign. Flush the literal text
      // before it, then append the percent as a literal segment. We keep it as
      // its own segment rather than merging so that positions stay obvious in
      // tests and downstream consumers.
      flushLiteral(i);
      segments.push({ type: "literal", value: "%" });
      i += 2;
      literalStart = i;
      continue;
    }

    if (next === "(") {
      const close = template.indexOf(")", i + 2);
      if (close === -1) {
        throw new TemplateError("unterminated named placeholder", i);
      }
      const name = template.slice(i + 2, close);
      if (name.length === 0) {
        throw new TemplateError("empty placeholder name", i);
      }
      if (close + 1 >= template.length) {
        throw new TemplateError("missing conversion after named placeholder", i);
      }
      const conversion = template[close + 1];
      if (!CONVERSIONS.has(conversion)) {
        throw new TemplateError(`unsupported conversion '%${conversion}'`, close + 1);
      }
      flushLiteral(i);
      segments.push({ type: "placeholder", name, conversion });
      i = close + 2;
      literalStart = i;
      continue;
    }

    if (CONVERSIONS.has(next)) {
      flushLiteral(i);
      segments.push({ type: "placeholder", name: null, conversion: next });
      i += 2;
      literalStart = i;
      continue;
    }

    throw new TemplateError(`unsupported conversion '%${next}'`, i + 1);
  }

  flushLiteral(template.length);
  return segments;
}

/**
 * Render a parsed template with a values object.
 *
 * Unnamed placeholders are assigned in order to the keys of `values`, using
 * `Object.keys` order. Named placeholders look up their name directly. A named
 * placeholder whose key is absent throws; an unnamed placeholder that runs out
 * of values throws. Extra values are ignored.
 *
 * The return value is a single string. Callers that want structured output
 * should use `parseTemplate` and build their own record.
 *
 * @param {string} template
 * @param {Record<string, unknown>} values
 * @returns {string}
 */
export function formatTemplate(template, values) {
  if (values === null || typeof values !== "object") {
    throw new TemplateError("values must be an object");
  }

  const segments = parseTemplate(template);
  const unnamedKeys = Object.keys(values);
  let unnamedIndex = 0;
  let out = "";

  for (const segment of segments) {
    if (segment.type === "literal") {
      out += segment.value;
      continue;
    }

    let value;
    if (segment.name === null) {
      if (unnamedIndex >= unnamedKeys.length) {
        throw new TemplateError("not enough values for unnamed placeholders");
      }
      value = values[unnamedKeys[unnamedIndex]];
      unnamedIndex += 1;
    } else {
      if (!Object.prototype.hasOwnProperty.call(values, segment.name)) {
        throw new TemplateError(`missing value for placeholder '${segment.name}'`);
      }
      value = values[segment.name];
    }

    out += stringifyValue(value, segment.conversion);
  }

  return out;
}

function stringifyValue(value, conversion) {
  switch (conversion) {
    case "s":
      return String(value);
    case "d": {
      if (typeof value === "number" && Number.isInteger(value)) {
        return String(value);
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      throw new TemplateError(`value for '%d' must be an integer, got ${typeof value}`);
    }
    case "f": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      throw new TemplateError(`value for '%f' must be a finite number, got ${typeof value}`);
    }
    case "j":
      return JSON.stringify(value);
    default:
      // Unreachable: parseTemplate rejects unknown conversions.
      throw new TemplateError(`unsupported conversion '%${conversion}'`);
  }
}
