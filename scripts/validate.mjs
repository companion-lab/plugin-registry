#!/usr/bin/env node
// Validate plugins.json against schema.json (plus registry-wide rules the
// schema cannot express).
//
//   node scripts/validate.mjs [--fix]
//
// Zero-dependency, like the other registry scripts: instead of pulling in an
// ajv-style library, it implements exactly the JSON Schema keywords this
// registry's schema.json uses ($ref into #/definitions, type, required,
// additionalProperties, properties, pattern, enum, minLength, maxLength,
// items, uniqueItems). If schema.json ever grows a keyword, teach it here.
//
// Checks, in order:
// 1. plugins.json parses and is byte-for-byte normalized (2-space indent,
//    trailing newline) — keeps PRs diff-clean. `--fix` rewrites the file
//    normalized instead of failing (the only sanctioned way to format it;
//    the sync jobs never touch plugins.json).
// 2. Schema conformance (including "no unknown fields", so typos like
//    `permission` instead of `permissions`, or a hand-added `version` field,
//    fail loudly).
// 3. Registry-wide rules: ids and repos unique.
// 4. Advisory, never failing: each repo's releases/latest is fetched so the
//    PR check surfaces "no releases yet" cases. Lookup failures (rate limit,
//    private repo, release in flight) print a warning and pass — the daily
//    sync-versions job is the authoritative resolver, not the PR gate.

import { readFileSync, writeFileSync } from "node:fs";

const REGISTRY_PATH = "plugins.json";
const SCHEMA_PATH = "schema.json";

const fix = process.argv.includes("--fix");

// ── Minimal JSON Schema validator (keywords listed in the header) ────────

function validate(value, schema, root, path, errors) {
  if (schema.$ref !== undefined) {
    const resolved = schema.$ref.startsWith("#/")
      ? schema.$ref
          .slice(2)
          .split("/")
          .reduce((node, key) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], root)
      : undefined;
    if (resolved === undefined) {
      errors.push(`${path}: unresolvable $ref ${schema.$ref}`);
      return;
    }
    validate(value, resolved, root, path, errors);
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(
        `${path}: expected ${schema.type}, got ${value === null ? "null" : typeof value}`,
      );
      return;
    }
  }

  if (schema.enum !== undefined && !schema.enum.some((option) => value === option)) {
    errors.push(`${path}: must be one of ${schema.enum.map((o) => JSON.stringify(o)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => validate(item, schema.items, root, `${path}[${index}]`, errors));
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push(`${path}: duplicate item ${key}`);
          return;
        }
        seen.add(key);
      }
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`${path}: missing required property "${key}"`);
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (schema.additionalProperties === false && !(key in properties)) {
        errors.push(`${path}: unknown property "${key}"`);
      } else if (key in properties) {
        validate(child, properties[key], root, `${path}.${key}`, errors);
      }
    }
  }
}

function matchesType(value, type) {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

// ── Checks ────────────────────────────────────────────────────────────────

function checkFormatting(raw) {
  const normalized = `${JSON.stringify(JSON.parse(raw), null, 2)}\n`;
  if (raw !== normalized) {
    return [
      "plugins.json is not normalized (expected 2-space indent, trailing newline).\n" +
        "  Fix: node scripts/sync-versions.mjs   (or reformat to match the existing file)",
    ];
  }
  return [];
}

// One repo's published release version, or null on any failure — advisory
// only, so a rate limit or a release-in-flight never blocks a contribution.
async function latestReleaseVersion(repo) {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "companion-plugin-registry" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`warn: ${repo}: GitHub API returned HTTP ${response.status}`);
      return null;
    }
    const release = await response.json();
    if (release.draft || release.prerelease) return null; // unexpected from /latest, stay safe
    return release.tag_name.replace(/^v/, "");
  } catch (error) {
    console.warn(`warn: ${repo}: lookup failed (${error.message})`);
    return null;
  }
}

async function checkReleases(plugins) {
  // SYNC_PLUGIN_FIXTURE=<path to {"repo": "version", …} JSON> replaces the
  // GitHub lookups — used to test this path offline.
  const fixturePath = process.env.SYNC_PLUGIN_FIXTURE;
  const fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;

  for (const plugin of plugins) {
    const published = fixture
      ? (fixture[plugin.repo] ?? null)
      : await latestReleaseVersion(plugin.repo);
    if (published === null) {
      console.warn(
        `warn: ${plugin.repo}: no published release found — the catalog chip shows "unreleased" until the first release lands`,
      );
    }
  }
}

async function main() {
  let raw = readFileSync(REGISTRY_PATH, "utf8");
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const registry = JSON.parse(raw);

  let errors = checkFormatting(raw);
  if (errors.length > 0 && fix) {
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
    console.log("normalized plugins.json formatting");
    errors = [];
  }
  validate(registry, schema, schema, "plugins.json", errors);

  const plugins = registry.plugins ?? [];
  for (const [field, label] of [
    ["id", "plugin id"],
    ["repo", "repository"],
  ]) {
    const seen = new Map();
    for (const plugin of plugins) {
      if (seen.has(plugin[field])) {
        errors.push(
          `plugins.json.plugins: duplicate ${label} "${plugin[field]}" (also used by "${seen.get(plugin[field]).name}")`,
        );
      } else {
        seen.set(plugin[field], plugin);
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`error: ${error}`);
    }
    console.error(`\n${errors.length} error(s) — plugins.json is invalid`);
    process.exitCode = 1;
    return;
  }

  console.log(`plugins.json: ${plugins.length} plugin(s), all checks passed`);
  await checkReleases(plugins);
}

await main();
