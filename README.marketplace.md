# Folder File Filter

Find matching Markdown, config, test, log, or asset files inside a selected Explorer folder.

## Features

- Adds a `Folder File Filter` view to the Explorer sidebar.
- Adds `Folder File Filter: Show Matching Files` to folder context menus in Explorer.
- Adds `Folder File Filter: Show Files With Same Extension` to file context menus in Explorer.
- Prompts for a glob mask such as `**/*.md`, `**/*.json`, `**/*.test.ts`, `**/*.log`, or `**/*.png`.
- Shows matching files from the selected source folder as clickable tree items.
- Supports refresh and clear actions from the `Folder File Filter` view title.
- Can open the highlighted result while moving through the results list.

## Use

1. Open a workspace in VS Code.
2. Right-click a folder in Explorer.
3. Run `Folder File Filter: Show Matching Files`.
4. Enter a glob mask.
5. Open files from the `Folder File Filter` view.

For files, right-click a file in Explorer and run `Folder File Filter: Show Files With Same Extension`. The command searches the selected file's parent folder using a mask inferred from the file name, such as `*.json` for `settings.json`.

## Settings

```json
{
  "folderFileFilter.defaultMask": "**/*",
  "folderFileFilter.maxResults": 500,
  "folderFileFilter.openOnSelection": false,
  "folderFileFilter.autoFilterFilesFromSelectedFile": true,
  "folderFileFilter.restoreFocusAfterOpenDelayMs": 150
}
```

Enable `folderFileFilter.openOnSelection` to open the highlighted result while moving through the list with Up/Down. Files open with their default editor in preview mode and focus stays in the `Folder File Filter` view.
Disable `folderFileFilter.autoFilterFilesFromSelectedFile` to confirm or edit the inferred mask before the file context menu command runs.
Increase `folderFileFilter.restoreFocusAfterOpenDelayMs` if a custom editor takes focus after opening and interrupts Up/Down navigation.

## License

Commercial licensing is available separately.
Unless you have a separate commercial license agreement, this project is licensed under MPL-2.0.
See the repository `LICENSE` for the full MPL-2.0 text and `NOTICE` for copyright and commercial licensing notice.

## Terms and Abbreviations

- `Explorer`: the VS Code sidebar that shows workspace folders and contributed views.
- `Glob`: a path matching pattern such as `**/*.md`, `**/*.json`, or `**/*.test.ts`.
- `MPL`: Mozilla Public License.
- `VS Code`: Visual Studio Code.
