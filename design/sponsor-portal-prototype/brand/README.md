# AAFE Brand Identity

> **Team source of truth: `docs/design.md` (Natalie, PR #14).** Follow it for tokens, fonts and components. This folder adds what it doesn't have: values measured from aafe.org, the vector logo mark, logo files, contrast checks and reference screenshots. Where they differ, design.md wins until the team decides otherwise.

Measured from the live aafe.org site (home + /donate) on Oct 5, 2026. Use this to make the gala app feel like AAFE without copying their website.

> AAFE's logo and photos stay **internal** (private repo, team and AAFE reviews) until AAFE approves in writing. Use placeholders for anything public, including Demo Day.

## What's in this folder

| File | What it is |
|---|---|
| `brand-board.html` / `brand-board.png` | One-page visual summary: logo, colors, type, buttons, spacing. Open the HTML in a browser, or drop the PNG into Figma. |
| `tokens.css` | Ready-to-use CSS variables and button, headline and link styles. |
| `tokens.json` | The same values as data, for Figma or any other tool. |
| `figma-make-prompt.md` | Prompt that applies this identity to our Figma Make prototype. |
| `logos/` | Logo files (see below). |
| `reference/` | Screenshots of aafe.org: donate hero, homepage hero, "What We Do" cards, footer. |

## Logos

| File | Use |
|---|---|
| `aafe-logo-orange.png` (1200×313) | Full logo on light backgrounds |
| `aafe-logo-white.png` (1200×313) | Full logo on dark backgrounds or photos |
| `aafe-mark-orange.svg` / `-white` / `-black` | **Vector** mark (the house and people icon), taken from the aafe.org footer. Use it for the app icon, favicon and small spaces. |
| `aafe-mark-orange.png` (210×210) | Raster mark |
| `header-logo-en/es/zh.png` | Low-res screenshots. The site's header logo is an animated GIF that cycles English → Spanish → Chinese. Reference only. |

The PNG logos come from our team repo (`prototype/shared/public/brand`). Ask AAFE for official vector files (SVG, AI or EPS) of the full logo before anything public.

## Colors

| Name | Hex | Use | Contrast |
|---|---|---|---|
| **Orange** | `#C64C28` | Primary buttons, links, accents, logo | White text on it: **4.70 ✓ AA** |
| Orange dark | `#BA4926` | Hover / pressed | White text: 5.16 ✓ |
| Black | `#000000` | Headings, body text, footer background | — |
| Grey 900 | `#4D4C4C` | Secondary text | 8.56 on white ✓ |
| Grey 600 | `#707070` | Muted text | 4.95 on white ✓ |
| Grey 400 | `#BAB9B9` | Borders only (too light for text) | — |
| Grey 200 | `#EBEBEB` | Dividers | — |
| Grey 100 | `#F4F4F6` | Soft panel backgrounds | Orange text on it: 4.28 (large text only) |
| Band | `#DADCDF` | Full-width section bands | Orange text on it: 3.42 (avoid) |
| White | `#FFFFFF` | Page background | — |

The site has **no status colors**, so our green, amber, grey and red for guest status stay ours.

**Our current app orange `#E0532A` fails WCAG AA with white text (3.86:1). Switch to `#C64C28`.**

## Typography

- **Poppins** for everything: headings, body, buttons, navigation. It's free on Google Fonts (Open Font License). Weights in use: 400, 600, 700.
- Poppins has no Chinese or Korean characters. Fall back to **Noto Sans TC** (Traditional Chinese, which is what aafe.org uses) and **Noto Sans KR**.

| Style | Size / line height | Weight | Notes |
|---|---|---|---|
| Display | 44 / 56 px | 700 | letter-spacing −1px |
| Section title | 40 px | 700 | **orange**, with a 2px orange line running to the right |
| H2 | 36 / 60 px | 700 | |
| H6 / card title | 22.4 / 33.6 px | 700 | |
| Body | 20 / 30 px | 400 | |
| Small | 16 / 25 px | 400 | card text |
| Nav | 14 px | 600 | UPPERCASE |
| Button | 16 px | 600 | UPPERCASE on the site |

## Spacing and shape

- Spacing scale (×1.5): **7 · 11 · 16 · 24 · 36 · 54 · 81 px**. The default gap between blocks is 24px.
- Content max width **1080px**, side padding 15px. Sections have about **100–120px** of padding top and bottom.
- Buttons are **pills** (50px radius), padding 8 × 24px, with a 2px border in the same color.
- Photos have **square corners** and no shadows.
- Signature details:
  - an **82 × 4px orange bar** above big headlines;
  - an orange rule next to section titles;
  - a ~4px orange line under each card (visual estimate);
  - "→ Learn more" links with a circled arrow.
- The footer is black, with the orange mark and white text.

## Applying it to the gala app

**Match these (identity):**
- the orange `#C64C28`;
- Poppins;
- bold black headlines;
- pill buttons;
- the orange accent bar or rule;
- the orange mark as the app icon;
- Traditional Chinese.

**Adapt these (we're a product, not a marketing site):**
- **Rounded glass cards.** The site has no app UI to copy, so our cards and glass chrome can stay.
- **Smaller body text.** Use 16–18px instead of 20px, for denser screens and the iPad check-in.
- **Sentence-case buttons.** Use them inside the app, and keep UPPERCASE for at most one hero call to action.
- **No Fraunces.** Replace the serif titles with Poppins 700.

Sources: computed CSS and WordPress theme presets on https://www.aafe.org/ and https://www.aafe.org/donate/
