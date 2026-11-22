#!/usr/bin/env node
// Sync each plugin's `version` field in plugins.json with its repo's latest
// published GitHub release.
//
//   node scripts/sync-versions.mjs [--dry-run] [--normalize-only]
//
// Runs daily in the registry's publish workflow (and after every merge), so
// the catalog chips stay fresh without touching the landing page: the site
// embeds plugins.json's versions as-is at build time.
//
// Never fails the build: a repo whose lookup errors (rate limit, no
// releases, transient 5xx) keeps its current version and prints a warning.
//
// Also the formatter for plugins.json — it rewrites the file normalized
// (2-space indent, trailing newline, field order as authored) — which is the
// shape scripts/validate.mjs requires. `--normalize-only` skips the GitHub
// lookups and just normalizes formatting.
//
// SYNC_PLUGIN_FIXTURE=<path to {"repo": "version", …} JSON> replaces the
// GitHub lookups entirely — used to test the rewrite path offline.

import { readFileSync, writeFileSync } from "node:fs";

const REGISTRY_PATH = "plugins.json";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const normalizeOnly = args.includes("--normalize-only");

// One repo's published release version, or null on any failure (the caller
// keeps the current version — see the header note about never failing).
async function latestReleaseVersion(repo, currentVersion) {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "companion-plugin-registry" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`warn: ${repo}: GitHub API returned HTTP ${response.status} — keeping ${currentVersion}`);
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

async function main() {
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const registry = JSON.parse(raw);
  const plugins = registry.plugins ?? [];

  // Formatting is judged before any version mutation below — JSON.stringify
  // of a version-bumped tree always differs from raw, which would otherwise
  // make the dry-run line read "would be normalized" for format-clean files.
  const formattingStale = `${JSON.stringify(registry, null, 2)}\n` !== raw;

  const fixturePath = process.env.SYNC_PLUGIN_FIXTURE;
  const fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;

  let changed = 0;
  for (const plugin of plugins) {
    if (normalizeOnly) continue;
    const published = fixture ? (fixture[plugin.repo] ?? null) : await latestReleaseVersion(plugin.repo, plugin.version);
    if (!published || published === plugin.version) continue;
    console.log(`${plugin.repo}: ${plugin.version} -> ${published}`);
    plugin.version = published;
    changed++;
  }

  const normalized = `${JSON.stringify(registry, null, 2)}\n`;
  if (dryRun) {
    console.log(`dry-run: ${changed} version(s) would change, formatting ${formattingStale ? "would be" : "already"} normalized`);
  } else if (changed > 0 || formattingStale) {
    writeFileSync(REGISTRY_PATH, normalized);
    console.log(`wrote ${changed} version(s) to ${REGISTRY_PATH}`);
  } else {
    console.log("plugins.json already up to date");
  }
}

await main();
