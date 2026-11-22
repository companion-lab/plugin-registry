<!--
Keep the checklist honest — the Validate workflow re-checks the formatting
and the generated markdown, but only you can confirm the release zips exist.
-->

## What does this PR change?

- [ ] Add a plugin
- [ ] Update a plugin (metadata / version / permissions)
- [ ] Remove a plugin
- [ ] Registry tooling / docs only (no catalog change)

## Plugin entry (skip if tooling/docs only)

- [ ] `plugins.json` keeps its formatting: 2-space indent, trailing newline
- [ ] `PLUGINS.md` regenerated (`node scripts/generate.mjs`) and committed
- [ ] `repo` points at a **public** GitHub repo with releases tagged `v<version>`
- [ ] Release zips follow the naming convention: `<id>-<version>[-<platform>].zip`
- [ ] Manifest targets ABI 3; declared `permissions` match what it actually uses
- [ ] `node scripts/validate.mjs` passes locally

## Notes for reviewers

<!-- Anything unusual: new permission names, id ≠ repo name, first entry from
     a third-party owner, … -->
