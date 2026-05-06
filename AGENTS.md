# Repository Agent Rules

This repository is the standalone VS Code extension `applicate2628.vscode-folder-file-filter`.
Keep agent work narrow, evidence-based, and release-safe.

## Scope Discipline

- Work only in this extension repository unless the user explicitly names another repository.
- Do not modify `vscode-s2p-preview` from this repository task unless the user asks for both extensions.
- Preserve unrelated local changes. If the working tree is dirty, inspect scope before staging.
- Keep feature fixes in the owner module under `src/`; avoid broad refactors for small behavior changes.
- Use tests for behavior changes. Prefer a focused regression test before production code when feasible.

## Marketplace And Discovery

- `package.json` is the source of truth for Marketplace and Open VSX metadata.
- `README.marketplace.md` is the Marketplace/Open VSX readme. The package command must keep using `vsce package --readme-path README.marketplace.md`.
- `README.md` is the GitHub/development readme and may include local build and release workflow details that do not belong in Marketplace copy.
- Before marketing or discovery changes, check `displayName`, `description`, `categories`, `keywords`, `galleryBanner`, `icon`, `repository`, `homepage`, `bugs`, and README links.
- Categories must use only VS Code's allowed manifest values from the official Extension Manifest reference. VS Code has no `Productivity`, `Files`, or `Explorer` category; use `Other` unless an official category clearly fits a new contribution.
- Compensate for the limited category fit with honest `keywords`, `displayName`, `description`, screenshots/GIFs, and Marketplace copy. Do not invent unsupported categories to improve search.
- Keep examples general and popular: docs, configs, tests, logs, reports, screenshots, generated assets. Do not use RF-specific examples here.
- Keep image/GIF references honest to the real VS Code UI. Generated or edited visuals require visual inspection before being used as evidence or committed.

## Product Scope

- This extension owns the Explorer-side filtered file list for one folder or the active/selected file's parent folder.
- Keep the behavior close to VS Code Explorer expectations: context menu entry on folders and files, default editor opening, optional open-on-selection, multi-selection where the Tree View API allows it, and focus restoration after preview/open.
- Do not replace the VS Code Explorer or build a full custom file manager unless the user explicitly expands scope.
- Do not add RF, Touchstone, or simulation-specific behavior here; those belong to `vscode-s2p-preview`.

## Release And Push

- Local development commits may be made without a version bump.
- Every push intended for GitHub, VS Code Marketplace, or Open VSX must include a patch version bump.
- Use `npm run release:patch` on Windows/PowerShell or `npm run release:patch:bash` in Bash when releasing from a clean tree.
- If releasing manually, do the equivalent steps: `npm version patch --no-git-tag-version`, update the local VSIX filename in `README.md`, run checks, commit, then push.
- Do not push without explicit user approval.
- Do not publish to Marketplace or Open VSX unless the user explicitly asks. Publishing uses the built `.vsix` for the same version as `package.json`.

## Required Checks Before Push Or Publication

Run these from the repository root:

```powershell
npm test
npm run package
npm audit --audit-level=moderate
git diff --check
```

Also run a publication-safety scan over staged changes before push:

```powershell
$safetyScript = ".agents\skills\lead\scripts\check-publication-safety.ps1"
if (-not (Test-Path -LiteralPath $safetyScript) -and $env:CODEX_HOME) {
  $safetyScript = Join-Path $env:CODEX_HOME "skills\lead\scripts\check-publication-safety.ps1"
}
if (Test-Path -LiteralPath $safetyScript) {
  powershell -ExecutionPolicy Bypass -File $safetyScript
}
git diff --cached --text | rg -n -i "D:\\|C:\\|BEGIN (RSA|OPENSSH|PRIVATE) KEY|token|secret|password|api[_-]?key|PRIVATE"
```

If the `rg` command exits with no matches, treat that as clean. Do not commit secrets, tokens, local absolute paths, raw logs, transcripts, or private screenshots.

## Review Expectations

- Before push, inspect the staged diff and verify the intended scope.
- For non-trivial behavior, release, or metadata changes, prefer an external pre-push review when available; Claude CLI review artifacts belong in scratch space, not in the repository.
- Do not treat external review as a substitute for local checks.
- If review feedback changes the staged diff, rerun the relevant checks before commit or push.

## Terms and Abbreviations

- `AGENTS.md`: repository-local instructions for agent sessions.
- `Marketplace`: the Visual Studio Code Marketplace.
- `Open VSX`: the open extension registry used by VS Code-compatible editors.
- `VS Code`: Visual Studio Code.
- `VSIX`: packaged install format for VS Code extensions.
- `RF`: Radio Frequency; RF-specific examples belong in `vscode-s2p-preview`, not this extension.
