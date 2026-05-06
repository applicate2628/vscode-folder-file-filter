# Folder File Filter

VS Code extension for filtering folder files by glob mask, file extension, or active file context inside VS Code Explorer.

[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=applicate2628.vscode-folder-file-filter) | [Open VSX](https://open-vsx.org/extension/applicate2628/vscode-folder-file-filter) | [GitHub repository](https://github.com/applicate2628/vscode-folder-file-filter)

## Why Use It

- Filter one folder by mask or extension without running a broad project search.
- Browse matching neighbors directly in Explorer while keeping file opening predictable.
- Use the active file context to jump between related docs, configs, tests, logs, and assets.

![Folder File Filter demo in VS Code highlighting the Explorer results view with matching CSV files](media/folder-file-filter-demo.gif)

## Scope

- Adds a `Folder File Filter` view to the Explorer sidebar.
- Adds `Folder File Filter: Show Matching Files` to folder context menus in Explorer.
- Adds a `Folder File Filter` action to file context menus in Explorer.
- Adds `Folder File Filter: Open Settings` to the Command Palette.
- Prompts for a glob mask such as `*.md`, `**/*.test.*`, `**/docs/**`, or `**/*backup*`.
- Shows extensions that already exist in the selected folder before recent masks and generic pattern presets.
- Shows the active mask as a clickable `Mask: ...` row at the top of the results view.
- Shows matching files from the selected source folder as clickable tree items.
- Can infer one filter from multiple selected files, such as `{*.json,*.md}`.
- Supports native Ctrl/Shift multi-selection and result context-menu actions for open, open to side, reveal in File Explorer, and copy path.
- Can follow the active file tab and update the filter when a file with another extension is opened.
- Supports refresh and clear actions from the `Folder File Filter` view title.

## Common Use Cases

- Filter docs such as `**/*.md`, `docs/**/*.md`, or `README*.md`.
- Filter configs such as `**/*.json`, `**/*.yaml`, `**/*.toml`, or `*.config.*`.
- Filter tests such as `**/*.test.ts`, `**/*.spec.js`, or `tests/**/*.py`.
- Filter logs, reports, screenshots, and generated assets without leaving Explorer.
- Right-click one or more files to infer a mask from their extensions and browse matching neighbors.

## Build

```powershell
npm install
npm test
npm run package
```

## Local Commits And Release

Commit normal development changes locally without bumping the extension version. Do not push every local change.

When the current local commit batch is ready to publish, push through the release script. Every push to GitHub must include a version bump:

```powershell
npm run release:patch
```

For Bash environments, use the equivalent script:

```bash
npm run release:patch:bash
```

Both scripts bump the package patch version once for the batch, update the local VSIX filename in this README, run tests, package the extension, run `npm audit`, commit the version bump, and push the current branch to the configured `origin`. They do not hardcode the GitHub owner; forks push to their own `origin`.

## Install Local VSIX

```powershell
code --install-extension .\vscode-folder-file-filter-0.0.19.vsix
```

## Use

1. Open a workspace in VS Code.
2. Right-click a folder in Explorer.
3. Run `Folder File Filter: Show Matching Files`.
4. Type a glob mask or pick one from the current-folder extensions, recent masks, or generic patterns dropdown.
5. Open files from the `Folder File Filter` view.

For files, right-click a file in Explorer and run `Folder File Filter`. The command searches the selected file's parent folder using a mask inferred from the file name, such as `*.json` for `settings.json`. If several files are selected with Ctrl or Shift, the command combines their unique masks, such as `{*.json,*.md}`.
The `Folder File Filter` results view also supports native Ctrl/Shift multi-selection.
To change the active mask without reopening the Explorer context menu, click the `Mask: ...` row at the top of the results view or use the `Change Mask` button in the view title. The title button uses the active Explorer file or folder first, then the active editor file's folder, then the last source folder.
To switch folders explicitly from the results view, select a file or folder in Explorer and use `Folder File Filter: Change Source Folder` from the view title.

To open extension settings, run `Folder File Filter: Open Settings` from the Command Palette.

## Settings

```json
{
  "folderFileFilter.defaultMask": "**/*",
  "folderFileFilter.maskPresets": [
    "**/*",
    "*.*",
    "**/*.*",
    "**/README*",
    "**/test*",
    "**/*test*",
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**",
    "**/docs/**",
    "**/src/**",
    "**/*-backup*",
    "**/*_backup*"
  ],
  "folderFileFilter.maxResults": 500,
  "folderFileFilter.openOnSelection": false,
  "folderFileFilter.autoFilterFilesFromSelectedFile": true,
  "folderFileFilter.autoFilterFromActiveFile": true,
  "folderFileFilter.restoreFocusAfterOpenDelayMs": 150
}
```

The mask picker shows extension masks found in the selected folder, the current/default mask, recently used manual masks, and `folderFileFilter.maskPresets`.
Folder extension suggestions scan only the selected folder's top level and are sorted by frequency, then by extension name.
Recent masks are stored in VS Code's extension global state. Automatic active-file filters do not add masks to that history.
Enable `folderFileFilter.openOnSelection` to open the highlighted result while moving through the list with Up/Down. Files open with their default editor in preview mode and focus stays in the `Folder File Filter` view.
Disable `folderFileFilter.autoFilterFilesFromSelectedFile` to confirm or edit the inferred mask before the file context menu command runs.
Disable `folderFileFilter.autoFilterFromActiveFile` if opening a file in the editor should not update the active filter automatically.
Increase `folderFileFilter.restoreFocusAfterOpenDelayMs` if a custom editor takes focus after opening and interrupts Up/Down navigation.

## Privacy And Security

The extension searches local workspace files through the VS Code extension API and opens matches with VS Code's default editor selection. It does not upload files, make network requests, or collect telemetry.

## Support The Project

If Folder File Filter helps your workflow, please star the GitHub repository or leave a rating on the marketplace where you installed it. This helps other VS Code users find the extension.

## License

Commercial licensing is available separately.
Unless you have a separate commercial license agreement, this project is licensed under MPL-2.0.
See `LICENSE` for the full MPL-2.0 text and `NOTICE` for copyright and commercial licensing notice.

## Terms and Abbreviations

- `Explorer`: the VS Code sidebar that shows workspace folders and contributed views.
- `Glob`: a path matching pattern such as `**/*.md`, `**/*.json`, or `**/*.test.ts`.
- `Mask picker`: the dropdown used to type or choose a glob mask.
- `Bash`: a Unix-style command shell available on Linux, macOS, WSL, and Git Bash.
- `Command Palette`: the VS Code command launcher opened with commands such as `Show All Commands`.
- `Ctrl` and `Shift`: keyboard modifier keys used by VS Code Explorer for multi-selection.
- `Custom editor`: a VS Code editor provided by an extension for a specific file type.
- `MPL`: Mozilla Public License.
- `Open VSX`: the open extension registry used by VS Code-compatible editors.
- `PowerShell`: Microsoft's command shell used by the default release script on Windows.
- `rating`: a user review or score on an extension marketplace.
- `star`: a GitHub repository star used as a lightweight public signal of user interest.
- `Telemetry`: automatic usage or diagnostic data collection; this extension does not collect it.
- `VS Code`: Visual Studio Code.
- `VS Code extension API`: the local API surface VS Code exposes to extensions.
- `VSIX`: the packaged install format for VS Code extensions.
