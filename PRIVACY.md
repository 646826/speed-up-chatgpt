# Privacy Policy — Speed Up ChatGPT

_Last updated: 2026-08-12_

**Speed Up ChatGPT** ("the extension") is designed to be fully private.

## Data collection

The extension collects **no personal data whatsoever**:

- No analytics, no telemetry, no tracking, no cookies.
- No account, no registration, no external servers operated by the developer.
- No data is transmitted anywhere. The extension makes **zero network requests**
  of its own; it only rewrites ChatGPT's own API responses locally, inside your
  browser tab, before they are rendered.

## Data storage

- Settings (enabled, message limit, batch size, quiet mode) are stored in
  `chrome.storage.local` on your device only.
- Conversation data used for the export feature stays in the tab's memory and
  is saved to a file **only when you explicitly click an export button**.
- PDF export temporarily writes the generated print-friendly HTML to
  `chrome.storage.local` and deletes it immediately after the preview opens.

## Permissions

- `storage` — persist your settings locally.
- Host access to `chatgpt.com` / `chat.openai.com` — required to intercept and
  trim conversation responses and to render the "Load more" UI.

## Changes

Any changes to this policy will be published with the extension's release notes.

## Contact

Open an issue in the project repository for any privacy questions.
