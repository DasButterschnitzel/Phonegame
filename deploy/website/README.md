# butterweich.media — files for Crop Crawler

Content for the owner's existing developer website. Nothing here is deployed automatically, and nothing here holds a
secret or a publisher ID.

| Put on the website | From | Notes |
|---|---|---|
| `/app-ads.txt` (the **root** of the host) | `../app-ads.txt.example` with your publisher ID | HUMAN-ONLY: the publisher line must come from your AdMob account. Check with `node scripts/check-app-ads.ts`. Plain text, HTTP 200, no redirect to another host. |
| `/crop-crawler/` | `crop-crawler.md` | product page copy (EN/DE) |
| `/crop-crawler/privacy/` (or keep GitHub Pages) | `../../public/privacy.html` | fill in every `[placeholder]` first; the URL must match Play Console and `src/platform/legal.ts` |
| `/support/` or `/contact/` | `support.md` | support and contact copy (EN/DE) |

The Play Console **developer website** must be `https://butterweich.media`: AdMob takes the host from the store
listing and its crawler fetches `https://butterweich.media/app-ads.txt`.
