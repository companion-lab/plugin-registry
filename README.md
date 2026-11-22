# companion plugin registry

The community registry of [Companion](https://companion-lab.github.io) plugins.
[`plugins.json`](plugins.json) is the single source of truth; anyone can add or
update a plugin with a pull request, and the
[/plugins page](https://companion-lab.github.io/plugins) of the landing site
picks it up automatically.

[`PLUGINS.md`](PLUGINS.md) is generated from the JSON — never edit it by hand.

## How a registration flows

```
PR edits plugins.json ──► validate.yml (schema + generated-files check)
        │
        ▼ merge to main
publish.yml: sync versions → regenerate PLUGINS.md → commit [skip ci]
        │
        ├─► repository_dispatch → companion-lab.github.io rebuilds the
        │   /plugins catalog immediately (needs REGISTRY_SYNC_TOKEN)
        │
        └─► (fallback) the landing page's daily rebuild re-reads this repo
            anyway, so a missed dispatch self-heals within 24h
```

The landing page embeds the catalog at build time
(`companion-landing-page/scripts/sync-registry.mjs` regenerates
`src/plugin_catalog.rs` from this repo's `plugins.json`), so no runtime
registry server exists — same static-pages constraint as before the registry.

## Entry format

Each element of `plugins.json`'s `plugins` array is one plugin; the exact
contract lives in [`schema.json`](schema.json) (editors use it for completions
via the `$schema` field). The fields:

| Field          | What it is                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| `id`           | The plugin's `manifest.json` id (lowercase letters, digits, dashes)        |
| `repo`         | Full GitHub slug `owner/name` — any public repo, not just companion-lab's  |
| `name`         | Display name on the plugin card                                            |
| `version`      | Latest published release (the `v`-tagged one, without the `v`); the daily sync keeps it fresh |
| `description`  | 10–400 chars shown on the card                                             |
| `icon`         | FontAwesome solid icon name, e.g. `fa-comments`                           |
| `color`        | Theme key: `purple`, `blue`, `indigo`, or `pink`                           |
| `permissions`  | The manifest's declared permissions — chips on the card, filter chips on the page |
| `frontend`     | Whether the manifest declares `frontend.entry` (bundled React UI)          |
| `backend`      | Whether the manifest declares `backend.library` (Rust dylib)               |

Formatting: 2-space indent, trailing newline — `scripts/validate.mjs` enforces
it (`node scripts/sync-versions.mjs` normalizes a hand-edited file).

## Scripts

All zero-dependency (`node >= 20`):

| Script                       | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `scripts/validate.mjs`       | Schema + uniqueness + formatting checks; advisory release lookups |
| `scripts/generate.mjs`       | `plugins.json` → `PLUGINS.md` (`--check` for CI freshness gates) |
| `scripts/sync-versions.mjs`  | Pull each repo's latest release into `plugins.json` (daily)    |

## Maintainer setup (one-time)

The instant-dispatch half of the pipeline needs a token in this repo's
**Settings → Secrets and variables → Actions**:

1. Create a classic personal access token with the `repo` scope (a dedicated
   "registry-sync" account or bot account is cleaner than a personal one).
2. Store it as the secret **`REGISTRY_SYNC_TOKEN`**.

Without the secret, `publish.yml` still runs — it just skips the dispatch with
a warning and the landing page's daily cron covers the sync instead. The token
only needs to call
[`POST /repos/companion-lab/companion-lab.github.io/dispatches`](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).

Also recommended: branch protection on `main` (require the `Validate` check +
one review) so the automation only ever runs on reviewed JSON.

## Related repos

- `companion-lab/companion-lab.github.io` — the landing site (Dioxus/WASM on
  GitHub Pages); embeds this registry's catalog at build time.
- `companion-lab/companion-plugin-*` — the official plugins' sources; their
  releases carry the installable zips (`<id>-<version>[-<platform>].zip`).
- `companion-lab/plugin-cli` — the build/scaffold CLI plugin authors use.
