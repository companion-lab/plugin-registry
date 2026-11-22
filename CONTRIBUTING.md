# Contributing a plugin

Thanks for registering your plugin! The whole flow is one JSON entry.

## Before you open a PR

Your plugin repo (any public GitHub account works) must publish installable
releases the Companion app can import:

1. **Releases are tagged** `v<version>` (e.g. `v1.2.0`) — the version chip on
   your card resolves automatically from the latest release; you never
   declare it anywhere.
2. **Release zips follow the naming convention** the app and the site both
   rely on:
   - backend plugins: one zip per platform —
     `<id>-<version>-windows-x86_64.zip`, `-macos-arm64`, `-macos-x86_64`,
     `-linux`
   - frontend-only plugins: a single universal `<id>-<version>.zip`
3. **The manifest targets ABI 3** (see the app's `PLUGINS.md` for the manifest
   spec) — scaffold a fresh plugin with `companion-cli` if you're starting out.
4. **Permissions are listed accurately** — they render as chips on your card
   and drive the site's permission filter. Declare only what the manifest
   actually uses.

## Steps

1. Fork this repo and create a branch.
2. Add (or edit) an entry in [`plugins.json`](plugins.json) — copy an existing
   entry as the template. Field contract: [`schema.json`](schema.json) (your
   editor will autocomplete it via the `$schema` field) and the
   [README table](README.md#entry-format).
   - Keep the file formatting: 2-space indent, trailing newline
     (`node scripts/validate.mjs --fix` normalizes it for you).
   - `repo` is the full `owner/name` slug; `id` is the manifest id (it does
     not have to equal the repo name).
   - No version field — versions resolve from your GitHub releases.
3. Regenerate the markdown:

   ```sh
   node scripts/generate.mjs
   ```

4. Sanity-check locally:

   ```sh
   node scripts/validate.mjs
   ```

   (Release lookups need `GITHUB_TOKEN` in the env to avoid rate limits; they
   are advisory — a warning never blocks you.)

   ```sh
   GITHUB_TOKEN=$(gh auth token) node scripts/validate.mjs
   ```

5. Commit both files (`plugins.json` + `PLUGINS.md`) and open the PR using the
   provided template.

## After merge

`publish.yml` runs automatically: it resolves your repo's latest release into
`versions.json` (refreshed daily from then on), regenerates `PLUGINS.md`, and
dispatches the landing page, which rebuilds with your plugin on
[/plugins](https://companion-lab.github.io/plugins) within minutes (at most a
day if the dispatch token is unavailable).

## Reviewing

Maintainers check that the entry matches the schema, the repo/released zips
follow the conventions above, and the description/permissions are honest.
The `Validate` workflow must pass; `PLUGINS.md` staleness fails it.
