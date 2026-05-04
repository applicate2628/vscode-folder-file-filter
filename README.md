# Folder File Filter

Standalone VS Code extension for finding matching documents, configs, tests, logs, and assets inside a selected Explorer folder.

## Scope

- Adds a `Folder File Filter` view to the Explorer sidebar.
- Adds `Folder File Filter: Show Matching Files` to folder context menus in Explorer.
- Prompts for a glob mask such as `**/*.md`, `**/*.json`, `**/*.test.ts`, `**/*.log`, or `**/*.png`.
- Shows matching files from the selected source folder as clickable tree items.
- Supports refresh and clear actions from the `Folder File Filter` view title.

## Build

```powershell
npm install
npm test
npm run package
```

## Release / Push Rule

Every push to GitHub must include a version bump. Use the release script instead of running `git push` directly for normal publication:

```powershell
npm run release:patch
```

The script bumps the package patch version, updates the local VSIX filename in this README, runs tests, packages the extension, runs `npm audit`, commits the version bump, and pushes the current branch to the configured `origin`. It does not hardcode the GitHub owner; forks push to their own `origin`.

## Install Local VSIX

```powershell
code --install-extension .\vscode-folder-file-filter-0.0.6.vsix
```

## Use

1. Open a workspace in VS Code.
2. Right-click a folder in Explorer.
3. Run `Folder File Filter: Show Matching Files`.
4. Enter a glob mask.
5. Open files from the `Folder File Filter` view.

## Settings

```json
{
  "folderFileFilter.defaultMask": "**/*",
  "folderFileFilter.maxResults": 500,
  "folderFileFilter.openOnSelection": false
}
```

Enable `folderFileFilter.openOnSelection` to open the highlighted result while moving through the list. Files open in preview mode and focus stays in the `Folder File Filter` view.

## License

Commercial licensing is available separately.
Unless you have a separate commercial license agreement, this project is licensed under MPL-2.0.
See `LICENSE` for the full MPL-2.0 text and `NOTICE` for copyright and commercial licensing notice.

## Terms and Abbreviations

- `Explorer`: the VS Code sidebar that shows workspace folders and contributed views.
- `Glob`: a path matching pattern such as `**/*.md`, `**/*.json`, or `**/*.test.ts`.
- `MPL`: Mozilla Public License.
- `VS Code`: Visual Studio Code.
- `VSIX`: the packaged install format for VS Code extensions.
