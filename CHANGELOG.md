# Changelog

All notable changes to Folder File Filter are documented here.

## Unreleased

- Added packaged changelog support for Open VSX and VS Code Marketplace release notes.
- Updated patch release scripts to finalize `## Unreleased` into the released version number and include `CHANGELOG.md` in the release commit.
- Added saved named filters that appear in the mask picker and can be updated from the results view.
- Added workspace-relative pinned source folders in the results view, with per-pinned-folder matches for the active mask.
- Added result sorting by path, file name, or extension, plus optional grouping by extension.
- Added automatic refresh of active results when matching files are created, changed, or deleted.
- Hardened command handling so searches and result actions stay inside provider-owned workspace results.

## 0.0.19 - 2026-05-06

- Added native Ctrl/Shift multi-selection support in the Folder File Filter results view.
- Added file-context filtering so right-clicking a file can show matching files in the same folder.
- Added automatic active-file filtering with settings to control inferred masks.
- Added open-on-selection navigation for previewing files while moving through results.
- Added mask presets and recent mask history to the mask picker.
- Added current-folder extension suggestions before recent masks and generic glob patterns in the mask picker.
- Kept the view-title mask picker available after `Clear`; it uses the active Explorer file or folder first, then the active editor file's folder, then the last source folder.
- Added a view-title source-folder button that switches to the active Explorer file or folder without opening a system folder dialog.
- Added GitHub, VS Code Marketplace, and Open VSX links plus customer-facing support copy.
- Improved Marketplace/Open VSX assets and README copy.

## 0.0.13 - 2026-05-05

- Published the standalone Folder File Filter extension with Explorer integration.
- Added folder-context filtering by glob mask.
- Added result actions for open, open to side, reveal in File Explorer, and copy path.

## Terms and Abbreviations

- `CHANGELOG`: release-history document packaged with the extension so registries can show a `Changes` or `Changelog` tab.
- `Explorer`: the VS Code sidebar that shows workspace folders and contributed views.
- `Glob`: a path matching pattern such as `**/*.md` or `**/*.json`.
- `Mask picker`: the dropdown used to type or choose a glob mask.
- `MPL`: Mozilla Public License.
- `Open VSX`: the open extension registry used by VS Code-compatible editors.
- `Pinned folder`: a workspace-relative source folder shortcut stored in VS Code workspace state.
- `Saved filter`: a named glob mask stored in extension settings.
- `Sort mode`: the selected result ordering, such as path, file name, or extension.
- `VS Code`: Visual Studio Code.
- `VSIX`: the packaged install format for VS Code extensions.
