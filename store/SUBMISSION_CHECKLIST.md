# Chrome Web Store — submission checklist

## 0. Enable CI (once)
- [ ] `bash scripts/setup-ci.sh && git push` — moves the ready-made workflows
      from `ci/workflows/` into `.github/workflows/` (kept there so the repo
      could be pushed without the OAuth `workflow` scope)

## 1. Developer account
- [x] Already registered (same publisher as page-to-md-pro)

## 2. Create the item (manual, once)
Automation updates EXISTING items — the first item must be created by hand:
- [ ] Developer dashboard → New item → upload `dist/speed-up-chatgpt.zip`
      (`bash scripts/build.sh`, or the CI artifact `speed-up-chatgpt-zip`)
- [ ] Note the new item's extension ID from the dashboard URL

## 3. Store listing tab
- [ ] Name / description: copy from `store/listing-en.md` (add RU localization
      from `store/listing-ru.md` via "Add language")
- [ ] Category: Productivity
- [ ] Icon: auto-taken from the package (icons/icon128.png)
- [ ] Screenshots (1280x800): `screenshot-1.png`, `screenshot-2.png`
      (store-assets bundle)
- [ ] Small promo tile (440x280): `promo-tile-440x280.png`
- [ ] Marquee (1400x560, optional): `promo-marquee-1400x560.png`

## 4. Privacy practices tab
- [ ] Single purpose: "Speeds up long ChatGPT conversations by limiting how
      many messages are rendered; exports chats to local files."
- [ ] Permission justification — storage: "Saves user preferences locally."
- [ ] Permission justification — host (chatgpt.com / chat.openai.com):
      "Core functionality: intercepts and trims the site's own conversation
      API response before rendering; all processing is local."
- [ ] Data usage: certify NO data collection (matches PRIVACY.md)
- [ ] Privacy policy URL: must be publicly accessible (raw PRIVACY.md after
      making the repo public, or GitHub Pages)

## 5. CI auto-publish (reuses the existing page-to-md-pro infrastructure)
The release workflow (`ci/workflows/publish.yml`) is a port of the proven
page-to-md-pro pipeline: Workload Identity Federation auth, `UPLOAD_ONLY`
default, release evidence, GitHub Release after store upload success.

Create a GitHub **environment** named `chrome-web-store` in this repo and add
the SAME secrets you already use for page-to-md-pro:
- [ ] `GCP_WORKLOAD_IDENTITY_PROVIDER` — same value as in page-to-md-pro
- [ ] `GCP_SERVICE_ACCOUNT` — same service account (it already has the
      chromewebstore scope authorized)
- [ ] `CWS_PUBLISHER_ID` — same publisher ID as page-to-md-pro
- [ ] `CWS_EXTENSION_ID` — the NEW item's ID (from step 2)
- [ ] (fallback instead of WIF) `GOOGLE_CREDENTIALS` — same SA key JSON

Modes: push to `main` with a bumped `version` in manifest.json → verified
`UPLOAD_ONLY` upload + GitHub Release; manual dispatch → `UPLOAD_ONLY` /
`STAGED_PUBLISH` / `DEFAULT_PUBLISH`.

## 6. Submit
- [ ] Submit for review in the dashboard (typically 1–3 days)
