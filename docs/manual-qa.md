# Folder File Filter Manual QA Checklist

Use this checklist before a release build or after changing Explorer integration, mask picking, result presentation, or file-opening behavior.

## Test Setup

- [ ] Install the current local VSIX into a separate VS Code or VS Code Insiders window.
- [ ] Open a workspace with at least three folders:
  - one folder with several common file extensions, such as `.md`, `.json`, `.csv`, `.png`
  - one folder with nested files
  - one folder with only one matching file for a chosen extension
- [ ] Keep the `Folder File Filter` view visible in Explorer.
- [ ] Check both light and dark themes when UI labels, icons, or result rows changed.

## Folder Context Menu

- [ ] Right-click a folder in Explorer.
- [ ] Run `Folder File Filter: Show Matching Files`.
- [ ] Confirm the mask picker opens without a Windows folder dialog.
- [ ] Pick an extension suggested under `Existing in this folder`.
- [ ] Confirm the results view shows `Mask: <mask> (<count>) <folder>`.
- [ ] Confirm every listed file belongs to the selected source folder and matches the mask.

## File Context Menu

- [ ] Right-click one file in Explorer.
- [ ] Run `Folder File Filter`.
- [ ] Confirm the source folder is the selected file's parent folder.
- [ ] Confirm the mask is inferred from the selected file name, such as `*.json`.
- [ ] Ctrl-select or Shift-select several files with different extensions.
- [ ] Run `Folder File Filter`.
- [ ] Confirm the inferred mask combines unique extensions, such as `{*.json,*.md}`.

## Active Source Folder

- [ ] Select a different folder in Explorer.
- [ ] Click `Change Mask` in the `Folder File Filter` view title.
- [ ] Confirm the picker uses the selected Explorer folder, not a stale previous folder.
- [ ] Click `Change Source Folder`.
- [ ] Confirm it switches to the active Explorer file or folder without opening a Windows folder dialog.
- [ ] Click `Clear`.
- [ ] Select a folder and click `Change Mask` again.
- [ ] Confirm the picker still opens and uses the selected folder.

## Mask Picker

- [ ] Type a custom mask and confirm `Use typed mask` appears first.
- [ ] Confirm `Existing in this folder` appears before saved filters, current mask, recent masks, and generic patterns.
- [ ] Confirm folder-extension suggestions reflect files in the selected folder, not the previous folder.
- [ ] Confirm recent manually chosen masks reappear in `Recent`.
- [ ] Confirm automatic active-file filters do not add noise to recent masks.

## Saved Filters

- [ ] Apply a custom mask.
- [ ] Click `Save Filter`.
- [ ] Enter a short name.
- [ ] Open `Change Mask`.
- [ ] Confirm the saved name appears under `Saved filters`.
- [ ] Pick it and confirm the stored mask is applied.
- [ ] Save the same filter name with a different active mask.
- [ ] Confirm the existing saved filter is updated rather than duplicated.
- [ ] Open extension settings and confirm `folderFileFilter.savedFilters` stores `{ "label": "...", "mask": "..." }`.

## Result Presentation

- [ ] Click `Change Sort` and choose `Path`.
- [ ] Confirm results are ordered by relative path.
- [ ] Click `Change Sort` and choose `Name`.
- [ ] Confirm results are ordered by file name, with relative path as the tie-breaker.
- [ ] Click `Change Sort` and choose `Extension`.
- [ ] Confirm results are ordered by extension, then file name, then relative path.
- [ ] Click `Toggle Group By Extension`.
- [ ] Confirm groups appear by extension and contain the matching files.
- [ ] Toggle grouping off.
- [ ] Confirm the same result set returns to a flat list without rerunning a different search.

## Live Refresh

- [ ] Enable `folderFileFilter.autoRefreshResults`.
- [ ] Apply a filter such as `*.md`.
- [ ] Create a new matching file in the active source folder.
- [ ] Confirm the result count and list update automatically after the debounce delay.
- [ ] Rename or delete that matching file.
- [ ] Confirm the result count and list update again.
- [ ] Create or edit a non-matching file.
- [ ] Confirm the active matching result list does not change incorrectly.
- [ ] Disable `folderFileFilter.autoRefreshResults`.
- [ ] Create a matching file and confirm the list waits for manual refresh.
- [ ] Increase `folderFileFilter.autoRefreshDebounceMs` if a tool writes many files and verify the update still happens after the configured delay.

## Opening And Selection

- [ ] Leave `folderFileFilter.openOnSelection` disabled.
- [ ] Move through results with Up and Down.
- [ ] Confirm files are not opened until Enter, Space, click, or context action.
- [ ] Enable `folderFileFilter.openOnSelection`.
- [ ] Move through results with Up and Down.
- [ ] Confirm each highlighted file opens in preview with its default editor.
- [ ] Confirm focus returns to the `Folder File Filter` view so sequential keyboard browsing continues.
- [ ] If a custom editor steals focus, increase `folderFileFilter.restoreFocusAfterOpenDelayMs` and retest.
- [ ] Ctrl-select or Shift-select several results.
- [ ] Confirm context actions apply to the selected result set where appropriate.

## Active File Automation

- [ ] Enable `folderFileFilter.autoFilterFromActiveFile`.
- [ ] Open a file in the editor.
- [ ] Confirm the filter updates to that file's parent folder and inferred extension mask.
- [ ] Open another file with the same extension in the same folder.
- [ ] Confirm the filter does not unnecessarily refresh.
- [ ] Open a file with a different extension or in a different folder.
- [ ] Confirm the filter updates.
- [ ] Disable `folderFileFilter.autoFilterFromActiveFile`.
- [ ] Confirm opening editor tabs no longer changes the active filter.

## Result Context Actions

- [ ] Right-click one result.
- [ ] Confirm `Open`, `Open to the Side`, `Reveal in File Explorer`, `Copy Path`, and `Copy Relative Path` are present.
- [ ] Run each action and confirm it targets the selected file.
- [ ] Multi-select results and confirm copy/open actions operate on the selected files, not only the right-clicked row when the row is part of the selection.

## Settings Surface

- [ ] Open `Folder File Filter: Open Settings` from the Command Palette.
- [ ] Confirm these settings are visible:
  - `Default Mask`
  - `Mask Presets`
  - `Max Results`
  - `Saved Filters`
  - `Sort By`
  - `Group By Extension`
  - `Auto Refresh Results`
  - `Auto Refresh Debounce Ms`
  - `Open On Selection`
  - `Auto Filter Files From Selected File`
  - `Auto Filter From Active File`
  - `Restore Focus After Open Delay Ms`

## Release Checks

- [ ] Run `npm test`.
- [ ] Run `npm run package`.
- [ ] Run `npm audit --audit-level=moderate`.
- [ ] Run `git diff --check`.
- [ ] Run the staged publication-safety scan from `AGENTS.md` before push.
- [ ] If pushing to GitHub, Marketplace, or Open VSX, use the release script so the patch version is bumped for the push.

## Terms and Abbreviations

- `Active file`: the file currently open or focused in a VS Code editor tab.
- `Debounce`: a short delay that collapses many rapid file events into one refresh.
- `Explorer`: the VS Code sidebar that shows workspace folders and contributed views.
- `Glob`: a path matching pattern such as `*.md`, `**/*.json`, or `{*.json,*.md}`.
- `Mask`: the glob pattern used to select matching files.
- `Mask picker`: the dropdown used to type or choose a mask.
- `Open VSX`: the open extension registry used by VS Code-compatible editors.
- `VS Code`: Visual Studio Code.
- `VSIX`: the packaged install format for VS Code extensions.
