# Chrome Web Store — submission checklist

## Done automatically
- [x] CI enabled: `.github/workflows/ci.yml` — green on main
- [x] Release pipeline enabled: `.github/workflows/publish.yml`
      (WIF auth, UPLOAD_ONLY default, evidence, GitHub Release)
- [x] GitHub environment `chrome-web-store` created
- [x] Privacy policy public URL (gist):
      https://gist.github.com/646826/e28a9cc9b54c88656c15ccc8e6d7fed5
- [x] Store package built: `dist/speed-up-chatgpt.zip` (CI artifact
      `speed-up-chatgpt-zip` on the latest CI run)

## 1. Create the item (manual, once — Google requires dashboard for the first item)
- [ ] Developer dashboard → New item → upload `dist/speed-up-chatgpt.zip`
- [ ] Note the new item's extension ID from the dashboard URL

## 2. Store listing tab
- [ ] Name / description: copy from `store/listing-en.md` (RU: `store/listing-ru.md`)
- [ ] Category: Productivity
- [ ] Screenshots 1280x800: `screenshot-1.png`, `screenshot-2.png` (store-assets bundle)
- [ ] Small promo tile 440x280: `promo-tile-440x280.png`
- [ ] Marquee 1400x560 (optional): `promo-marquee-1400x560.png`

## 3. Privacy practices tab
- [ ] Single purpose: "Speeds up long ChatGPT conversations by limiting how
      many messages are rendered; exports chats to local files."
- [ ] Permission justification — storage: "Saves user preferences locally."
- [ ] Permission justification — host: "Intercepts and trims the site's own
      conversation API response before rendering; all processing is local."
- [ ] Data usage: certify NO data collection (matches PRIVACY.md)
- [ ] Privacy policy URL: the gist URL above

## 4. Environment secrets (chrome-web-store)
Same values as page-to-md-pro (GitHub UI never shows secret values — take them
from your records / GCP Console):
- [ ] `GCP_WORKLOAD_IDENTITY_PROVIDER` — GCP Console → IAM → Workload Identity Pools
- [ ] `GCP_SERVICE_ACCOUNT` — service account email with chromewebstore scope
- [ ] `CWS_PUBLISHER_ID` — visible in the developer dashboard URL
- [ ] `CWS_EXTENSION_ID` — the NEW item's ID (step 1)
- [ ] (fallback) `GOOGLE_CREDENTIALS` — SA key JSON

After secrets are set: rerun the failed "Chrome Web Store Release" run —
the verified package uploads automatically (UPLOAD_ONLY).

## 5. Submit
- [ ] Submit for review (typically 1–3 days)
