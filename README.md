# Ambient Light for TikTok

Ambient Light for TikTok adds reactive, glowing ambient lighting around TikTok videos in the browser.

## Install in Chrome (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder (the folder containing `manifest.json`).
6. Open TikTok and refresh the page.

The extension runs on TikTok pages and can be controlled from its toolbar popup. The keyboard shortcut is `Alt+Shift+L` by default.

## Update a local installation

After pulling a newer version, return to `chrome://extensions` and click **Reload** on the extension card, then refresh any open TikTok tabs.

## Project structure

- `manifest.json` — Chrome extension manifest and permissions
- `content.js` / `content.css` — ambient-light behavior and page styling
- `popup.html` / `popup.js` / `popup.css` — toolbar controls
- `background.js` — settings initialization, badge state, and keyboard shortcut
- `defaults.js` — default settings
- `icons/` — extension icons

## Privacy

The extension uses Chrome local storage for its settings and does not require an external service or account.

## Compatibility

Chrome and other Chromium-based browsers that support Manifest V3.
