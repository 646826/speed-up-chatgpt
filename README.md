# Speed Up ChatGPT — Lag Fix & Chat Export

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-lightgrey.svg)](manifest.json)
[![CI](https://github.com/646826/speed-up-chatgpt/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

**Speed up ChatGPT long conversations.** If ChatGPT gets slow, lags or freezes in
long chats, this open-source Chrome extension fixes it: it makes ChatGPT render
only the latest messages instead of the whole conversation — so long chats stay
fast and responsive. Bonus: export any ChatGPT chat to **PDF, Markdown, TXT or JSON**.

## Why ChatGPT gets slow in long chats

Every message in a conversation stays in the DOM. After 100+ messages the page
has thousands of nodes with code blocks, markdown and math — scrolling stutters,
typing lags, the tab eats gigabytes of RAM and can freeze entirely.

## How this extension fixes ChatGPT lag

The extension intercepts ChatGPT's own conversation API response **before the app
renders it** and trims the message tree to the latest **N messages** (default 15,
configurable 5–200). Nothing is deleted — your full chat stays intact on the
server and in the captured data; the browser simply renders fewer nodes:

- ⚡ **Instant boost** — long conversations load and scroll fast again
- 🔢 **Adjustable limit** — choose how many recent messages stay visible
- ⬆️ **"Load more" button** — pull older messages back in batches, scroll position is preserved
- 📊 **Live stats** — visible / hidden / total message counters
- 📤 **Chat export** — save any conversation as PDF (print-ready), Markdown, plain text or JSON
- 🔕 **Quiet mode** — disable toast notifications
- 🔒 **100% private** — no accounts, no analytics, no servers; everything runs locally in your browser

## Install

### From source (developer mode)

1. Clone or download this repository
2. Run `bash scripts/build.sh` (generates icons and the store zip) — or skip and just load the folder, running `node scripts/generate-icons.mjs` first to create `icons/`
3. Open `chrome://extensions` → enable **Developer mode**
4. Click **Load unpacked** and select the project folder
5. Open a long chat on [chatgpt.com](https://chatgpt.com) — it is boosted automatically

### From Chrome Web Store

See [store/SUBMISSION_CHECKLIST.md](store/SUBMISSION_CHECKLIST.md) for the
packaging & publishing pipeline (automated via GitHub Actions).

## Usage

- Click the extension icon to open the popup: toggle the boost, set the visible
  message limit and the "Load more" batch size, view stats, export the chat.
- When older messages exist, a **"Load N previous messages"** button appears at
  the top of the chat — click it to reveal history step by step.
- Export buttons (Markdown / Text / JSON / PDF) work on the currently open chat.

## How it works (technical)

- A `MAIN`-world content script (`content/main-interceptor.js`) patches
  `window.fetch` and transparently rewrites `GET /backend-api/conversation/<id>`
  responses, trimming the `mapping` tree along the active branch (regenerations
  and hidden nodes handled). Pure, unit-tested logic — see `test/trimmer.test.js`.
- An `ISOLATED`-world bridge syncs settings from `chrome.storage` into the page.
- The UI (load-more button, toast, scroll restore) lives in `content/page-ui.js`.
- Export (`export/exporter.js`) uses the full captured conversation — never the
  trimmed one — so exports always contain the complete chat.
- PDF export renders a clean print-friendly page and uses the browser's
  "Save as PDF".

## Privacy

No data collection whatsoever. No remote calls. Settings live in
`chrome.storage.local`; captured conversation data never leaves the tab.
Full text: [PRIVACY.md](PRIVACY.md).

## Contributing

Issues and PRs are welcome. Run the tests with `node test/trimmer.test.js`.

## License

[MIT](LICENSE) © 2026 Speed Up ChatGPT contributors
