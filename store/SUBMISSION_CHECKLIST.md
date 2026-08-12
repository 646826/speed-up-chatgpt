# Chrome Web Store — submission checklist

## 0. Enable CI (once)
- [ ] `bash scripts/setup-ci.sh && git push` — moves the ready-made workflows
      from `ci/workflows/` into `.github/workflows/` (kept there so the repo
      could be pushed without the OAuth `workflow` scope)

## 1. Developer account
- [ ] Register at https://chrome.google.com/webstore/devconsole (one-time $5 fee)

## 2. Package
- [ ] `bash scripts/build.sh` → `dist/speed-up-chatgpt.zip`
  (or download the `speed-up-chatgpt-zip` artifact from the latest CI run)

## 3. Create the item
- [ ] Developer dashboard → New item → upload the zip

## 4. Store listing tab
- [ ] Name / description: copy from `store/listing-en.md` (add RU localization
      from `store/listing-ru.md` via "Add language")
- [ ] Category: Productivity
- [ ] Icon: auto-taken from the package (icons/icon128.png)
- [ ] Screenshots (1280x800 or 640x400, up to 5): use `screenshot-1.png`,
      `screenshot-2.png` from the store-assets bundle
- [ ] Small promo tile (440x280): `promo-tile-440x280.png`
- [ ] Marquee (1400x560, optional): `promo-marquee-1400x560.png`

## 5. Privacy practices tab
- [ ] Single purpose: "Speeds up long ChatGPT conversations by limiting how
      many messages are rendered; exports chats to local files."
- [ ] Permission justification — storage: "Saves user preferences locally."
- [ ] Permission justification — host (chatgpt.com / chat.openai.com):
      "Core functionality: intercepts and trims the site's own conversation
      API response before rendering; all processing is local."
- [ ] Data usage: certify NO data collection (matches PRIVACY.md)
- [ ] Privacy policy URL: must be publicly accessible. Options:
      a) flip the repo to public and use the raw PRIVACY.md URL, or
      b) enable GitHub Pages and publish PRIVACY.md there.

## 6. CI auto-publish (optional)
Add these repository secrets (Settings → Secrets and variables → Actions):
- [ ] `CHROME_EXTENSION_ID` — from the dashboard item URL
- [ ] `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` — Google Cloud project with
      "Chrome Web Store API" enabled → OAuth 2.0 client (desktop type)
- [ ] `CHROME_REFRESH_TOKEN` — via OAuth playground, scope
      `https://www.googleapis.com/auth/chromewebstore`
Then: Actions → publish → Run workflow (or push a release).

## 7. Submit
- [ ] Submit for review (typically 1–3 days)
