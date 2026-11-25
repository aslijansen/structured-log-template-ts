import test from "node:test";
import assert from "node:assert/strict";

import { parseTemplate, formatTemplate, TemplateError } from "../src/index.js";

test("parses a template with no placeholders", () => {
  assert.deepEqual(parseTemplate("hello world"), [
    { type: "literal", value: "hello world" },
  ]);
});

test("parses an empty template", () => {
  assert.deepEqual(parseTemplate(""), []);
});

test("parses unnamed placeholders", () => {
  assert.deepEqual(parseTemplate("%s %d %f %j"), [
    { type: "placeholder", name: null, conversion: "s" },
    { type: "literal", value: " " },
    { type: "placeholder", name: null, conversion: "d" },
    { type: "literal", value: " " },
    { type: "placeholder", name: null, conversion: "f" },
    { type: "literal", value: " " },
    { type: "placeholder", name: null, conversion: "j" },
  ]);
});

test("parses named placeholders", () => {
  assert.deepEqual(parseTemplate("user=%(user)s id=%(id)d"), [
    { type: "literal", value: "user=" },
    { type: "placeholder", name: "user", conversion: "s" },
    { type: "literal", value: " id=" },
    { type: "placeholder", name: "id", conversion: "d" },
  ]);
});

test("treats %% as a literal percent", () => {
  assert.deepEqual(parseTemplate("100%% done"), [
    { type: "literal", value: "100" },
    { type: "literal", value: "%" },
    { type: "literal", value: " done" },
  ]);
});

test("rejects a dangling percent", () => {
  assert.throws(() => parseTemplate("oops%"), TemplateError);
});

test("rejects an unsupported conversion", () => {
  assert.throws(() => parseTemplate("%x"), TemplateError);
});

test("rejects an unterminated named placeholder", () => {
  assert.throws(() => parseTemplate("%(name"), TemplateError);
});

test("rejects an empty placeholder name", () => {
  assert.throws(() => parseTemplate("%()s"), TemplateError);
});

test("rejects a named placeholder with no conversion", () => {
  assert.throws(() => parseTemplate("%(name)"), TemplateError);
});

test("formats named placeholders", () => {
  assert.equal(
    formatTemplate("user=%(user)s id=%(id)d", { user: "ada", id: 7 }),
    "user=ada id=7"
  );
});

test("formats unnamed placeholders in key order", () => {
  assert.equal(formatTemplate("%s-%d", { a: "x", b: 3 }), "x-3");
});

test("formats a JSON placeholder", () => {
  assert.equal(formatTemplate("data=%(payload)j", { payload: { ok: true } }), 'data={"ok":true}');
});

test("throws when a named placeholder is missing", () => {
  assert.throws(() => formatTemplate("%(user)s", {}), TemplateError);
});

test("throws when unnamed placeholders run out of values", () => {
  assert.throws(() => formatTemplate("%s %s", { a: "only" }), TemplateError);
});

test("throws when a %d value is not an integer", () => {
  assert.throws(() => formatTemplate("%d", { a: 1.5 }), TemplateError);
});

test("throws when a %f value is not finite", () => {
  assert.throws(() => formatTemplate("%f", { a: Infinity }), TemplateError);
});

test("accepts bigint for %d", () => {
  assert.equal(formatTemplate("%d", { a: 10n }), "10");
});

test("ignores extra values", () => {
  assert.equal(formatTemplate("%(a)s", { a: "x", b: "y" }), "x");
});
