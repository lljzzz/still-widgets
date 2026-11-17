#!/usr/bin/env node
// Validates every widget package and writes index.json.
//
//   node scripts/build-index.mjs           validate, then write index.json
//   node scripts/build-index.mjs --check   validate only (used on pull requests)
//
// Needs Node 18+ and nothing else.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema/package.schema.json"), "utf8"));
const MAX_BYTES = 256 * 1024;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** A small validator for the JSON Schema features the package schema uses. */
function validate(value, rule, at, errors) {
  if (rule.$ref) rule = rule.$ref.split("/").slice(1).reduce((n, k) => n[k], schema);
  const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const fail = (message) => errors.push(`${at || "package"}: ${message}`);
  if ("const" in rule && value !== rule.const) return fail(`must be ${JSON.stringify(rule.const)}`);
  if (rule.enum && !rule.enum.includes(value)) return fail(`must be one of ${rule.enum.join(", ")}`);
  if (rule.type) {
    const types = [].concat(rule.type);
    const ok = types.some((t) => (t === "integer" ? Number.isInteger(value) : t === type));
    if (!ok) return fail(`must be ${types.map((t) => (t === "integer" ? "an integer" : `a ${t}`)).join(" or ")}`);
  }
  if (type === "string") {
    if (rule.minLength != null && value.length < rule.minLength) fail(`must not be empty`);
    if (rule.maxLength != null && value.length > rule.maxLength)
      fail(`must be ${rule.maxLength} characters or fewer`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail(`has an unsupported value`);
  }
  if (type === "number") {
    if (!Number.isFinite(value)) fail("must be a finite number");
    if (rule.minimum != null && value < rule.minimum) fail(`must be at least ${rule.minimum}`);
    if (rule.maximum != null && value > rule.maximum) fail(`must be at most ${rule.maximum}`);
  }
  if (type === "array") {
    if (rule.minItems != null && value.length < rule.minItems) fail(`needs at least ${rule.minItems} item(s)`);
    if (rule.maxItems != null && value.length > rule.maxItems) fail(`allows at most ${rule.maxItems} items`);
    if (rule.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
      fail("must not repeat items");
    if (rule.items) value.forEach((v, i) => validate(v, rule.items, `${at}[${i}]`, errors));
  }
  if (type === "object") {
    for (const key of rule.required ?? [])
      if (!(key in value)) fail(`is missing "${key}"`);
    for (const [key, v] of Object.entries(value)) {
      const child = rule.properties?.[key];
      if (child) validate(v, child, at ? `${at}.${key}` : key, errors);
      else if (rule.additionalProperties === false) fail(`has an unknown field "${key}"`);
    }
  }
  for (const part of rule.allOf ?? []) {
    const probe = [];
    if (part.if) validate(value, part.if, at, probe);
    if (part.if && !probe.length && part.then) validate(value, part.then, at, errors);
  }
}

function lastChanged(dir) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", dir], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) return out;
  } catch {
    // Not a git checkout; fall back to the file time.
  }
  return fs.statSync(dir).mtime.toISOString().slice(0, 10);
}

const widgetsDir = path.join(root, "widgets");
const entries = [];
const problems = [];
for (const id of fs.readdirSync(widgetsDir).sort()) {
  const dir = path.join(widgetsDir, id);
  if (!fs.statSync(dir).isDirectory()) continue;
  const file = path.join(dir, "widget.still.json");
  const where = `widgets/${id}`;
  if (!ID.test(id)) {
    problems.push(`${where}: folder names use lowercase letters, numbers and dashes`);
    continue;
  }
  if (!fs.existsSync(file)) {
    problems.push(`${where}: add a widget.still.json file`);
    continue;
  }
  if (fs.statSync(file).size > MAX_BYTES) {
    problems.push(`${where}: packages must be smaller than 256 KB`);
    continue;
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`${where}: not valid JSON (${e.message})`);
    continue;
  }
  const errors = [];
  validate(pkg, schema, "", errors);
  if (!errors.length && pkg.kind === "system" && pkg.options?.metrics?.length === 0)
    errors.push("options.metrics: choose at least one metric");
  if (!errors.length && pkg.kind === "code") {
    const c = pkg.code;
    if (!c.html?.trim() && !c.js?.trim()) errors.push("code: add html or js");
    const size = Buffer.byteLength((c.html ?? "") + (c.css ?? "") + (c.js ?? ""));
    if (size > 128 * 1024) errors.push("code: html, css and js must total 128 KB or less");
    const keys = new Set();
    for (const f of c.fields ?? []) {
      if (keys.has(f.key)) errors.push(`code.fields: the key "${f.key}" is used twice`);
      keys.add(f.key);
      const typed =
        (f.type === "number" && typeof f.default === "number") ||
        (f.type === "toggle" && typeof f.default === "boolean") ||
        (f.type === "color" && /^#[0-9a-fA-F]{6}$/.test(f.default)) ||
        (f.type === "text" && typeof f.default === "string") ||
        (f.type === "select" && (f.options ?? []).includes(f.default));
      if (!typed) errors.push(`code.fields: "${f.key}" has a default that doesn't match its type`);
    }
  }
  if (errors.length) {
    problems.push(...errors.map((e) => `${where}: ${e}`));
    continue;
  }
  entries.push({ id, updated: lastChanged(dir), package: pkg });
}

if (problems.length) {
  console.error(`Found ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
if (check) {
  console.log(`${entries.length} widget package(s) are valid.`);
  process.exit(0);
}
const index = {
  format: "still-catalog",
  version: 1,
  name: "Still widget catalog",
  updated: entries.reduce((latest, e) => (e.updated > latest ? e.updated : latest), ""),
  widgets: entries,
};
fs.writeFileSync(path.join(root, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote index.json with ${entries.length} widget(s).`);
