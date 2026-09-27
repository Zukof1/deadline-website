# Deadline — website

Static site for [Deadline](https://apps.apple.com/app/deadline/id6767482309). No build step. Deployed on Vercel with `cleanUrls` (so `/privacy` serves `privacy.html`).

```bash
npx serve . -l 4321
```

## Pages

| Path | File | Notes |
|---|---|---|
| `/` | `index.html` | Marketing page |
| `/privacy` | `privacy.html` | Linked from the App Store listing — keep this URL working |
| `/support` | `support.html` | FAQ + contact |
| `/sandbox` | `sandbox.html` | Older interactive demo, unchanged and unlinked |

## Assets

- `assets/css/site.css`, `assets/js/site.js` — everything, one file each.
- `assets/fonts/Satoshi-Variable.woff2` — the app’s own Satoshi, converted from `assets/fonts/Satoshi/Satoshi-Variable.ttf`.
- `assets/img/icons.svg` — glyphs extracted from the app’s Ionicons font, so icons match the app exactly.
- `assets/img/screens/*.webp` — screens from the current App Store screenshots.
- `assets/video/rec-*.mp4` — the real screen recordings from `marketing/reference-videos/`, re-encoded (H.264, 600px, no audio). They load and play only while on screen.
- `assets/video/ad-1158-confession.mp4` — the “11:58 Confession” ad, loaded only when someone opens it.
- `assets/img/og.png` — share image. Source: `Deadline-Creative/11_Website/og-image.html` in the app repo.

## Things that must stay in sync with the app

The live parts of the page are ported from the app’s source, not approximated. If the app changes, update these:

| On the site | In the app |
|---|---|
| `getUrgency`, `formatLive`, card ticking rule | `utils/urgency.ts`, `components/TaskCard.tsx` |
| `.tc` card styles | `components/TaskCard.tsx` styles |
| `.sc` subject card, `COLORS`, `SUBJECT_ICONS` | `app/(tabs)/index.tsx` |
| `nextDue` pill | `app/subject/[id].tsx` |
| `THEMES` | `constants/theme.ts` |
| Widget previews (`wCountdown`, `wCompact`, `wColor`) | `plugins/deadline-widget/ios/DeadlineWidget.swift` |
| Reminder banners, daily lines | `services/notificationService.ts` |

## App Store button

`.badge` is a hand-built button. If you’d rather use Apple’s official badge artwork, download it from Apple’s marketing tools and drop the SVG into the three `.badge` links.
