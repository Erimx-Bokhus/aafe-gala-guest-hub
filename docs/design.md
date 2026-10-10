# Design system

Written by Natalie Walker

AAFE wants the tool to stay on brand: **AAFE orange, white, black and cool grays**, matching aafe.org ([requirements](requirements.md): "Branding matching aafe.org"). This file is the single reference for colors, type, and components across the sponsor portal, staff workspace, iPad check-in, and badges.

The tokens below come from AAFE's brand system by **Greybox Creative**, the agency that designed AAFE's identity and aafe.org ([case study](https://www.greyboxcreative.com/work/aafe/)), and from aafe.org's live styles. ✏️ *Changed Oct 10, 2026*

## Change history
How changes are marked in this file:

| Mark | Meaning |
| --- | --- |
| ~~struck through~~ | **No longer used.** Kept so the history stays visible. |
| ✏️ | Changed rule (the old value is struck through next to it) |
| 🆕 | New rule |

Dates and times are New York time (ET). Full details are in [Appendix A](#appendix-a-change-log).

| Version | Date and time (ET) | Author | Summary |
| --- | --- | --- | --- |
| 1.0 | Oct 3, 2026, 11:51 PM | Natalie Walker | First version: AAFE orange and white, no navy (PR #14) |
| 1.1 | Oct 4, 2026, 1:14 PM | Natalie Walker | Staff sidebar is AAFE orange with the logo on a white band (PR #14) |
| 2.0 | Oct 10, 2026, 1:01 PM | Natalie Walker | Aligned with Greybox's AAFE brand: cool gray instead of cream, black as second color, Poppins, pill buttons, print orange, three logo layouts |
| 2.1 | Oct 10, 2026, 1:15 PM | Natalie Walker | Exact values from aafe.org: grays, black headings, hover orange, input borders, and the full type scale; **no cream anywhere**, including highlights |
| 2.2 | Oct 10, 2026, 1:27 PM | Natalie Walker | Button shapes: pill, radius 50px, padding 8px 24px, min height 44px, 2px border; primary turns white with orange text on hover; secondary white with gray border; ALL CAPS only for short calls to action (SIGN IN) |
| 2.3 | Oct 10, 2026, 2:04 PM | Natalie Walker | Fixes from the staff-app QA pass: no brown in dark mode, tabs, toggles and icon buttons follow the button spec, no monospace, small table buttons are the one documented exception |
| 2.4 | Oct 10, 2026, 2:52 PM | Natalie Walker | Scope notes match what shipped: the staff app is done in PR #96; the guest portal's serif headings and type scale are still to do |

## Principles
1. **White first, orange for meaning.** Pages are white or light gray. Orange marks the one main action on a screen, the brand mark, and focus. If everything is orange, nothing stands out.
2. **Readable before decorative.** Sponsors fill the form on phones; staff work at the check-in desk on an iPad in a dim room. Every text color meets WCAG AA (4.5:1).
3. **Plain and mainstream.** Tailwind tokens and a short list of components a future partner can maintain (CLAUDE.md rule 9).
4. 🆕 **Follow AAFE's brand, not our taste.** When this file and aafe.org disagree, aafe.org and Greybox's brand system win. *Added Oct 10, 2026*
5. 🆕 **Only cool grays.** No cream, beige or warm gray anywhere: not in backgrounds, highlights, selected rows, borders or tags. *Added Oct 10, 2026 (v2.1)*

## Color

### Brand
| Token | Hex | Use |
| --- | --- | --- |
| `brand-500` | `#C64C28` | **AAFE orange on screens** (aafe.org's exact value). Primary buttons, links, active nav, focus ring, logo mark |
| `brand-600` | ~~`#A93D1D`~~ → **`#BA4926`** | Hover and pressed state of primary buttons; white on it is 5.2:1. ✏️ *v2.1* |
| 🆕 `brand-print` | `#E74F26` | **AAFE orange for print** (Greybox's brand boards, cards, shirts). Badges, signage, printed materials. **Never behind white text on screens:** 3.8:1. *v2.0* |
| `brand-700` | `#8A3118` | Orange text on light backgrounds |
| `brand-400` | `#DB7A55` | Decorative only (icons, chart fills). **Not for text on white** (3.0:1) |
| `brand-200` | `#F0C3AD` | Borders on selected items |
| `brand-100` | `#F8E3D8` | **Focus halo only** (the ring around a focused field). Not a background. ✏️ *v2.1* |
| `brand-50` | ~~`#FCF3EE`~~ → **`#F4F4F6`** | Selected rows, highlights, "to review" tags, info panels. **Gray, not peach.** ✏️ *v2.1* |
| `white` | `#FFFFFF` | **Page and card background.** Text on orange and on black |
| 🆕 `black` | `#000000` | **AAFE's second brand color** and the heading color. Footers, one feature band per page; orange logo or white text on it. *v2.0* |

### Text ✏️ *v2.1*
| Token | Hex | Use |
| --- | --- | --- |
| `ink` | ~~`#313131`~~ → **`#000000`** | Headings and body text (aafe.org) |
| `ink-muted` | ~~`#5E5650`~~ ~~`#5C5C5C`~~ → **`#4D4C4C`** | Secondary text, table headers, labels. 8.6:1 on white, 7.8:1 on gray |
| `ink-subtle` | ~~`#7A706A`~~ ~~`#737373`~~ → **`#707070`** | Small meta text and placeholders, **on white only** (4.95:1). On gray, use `ink-muted`. |

### Backgrounds and lines ✏️ *v2.1: only cool grays*
| Token | Hex | Use |
| --- | --- | --- |
| `gray` | ~~`#FBF7F0` (cream)~~ ~~`#F3F4F8`~~ → **`#F4F4F6`** | Light gray: page background of the portal and iPad app, section bands, hover, selected rows |
| ~~`gray-100`~~ | ~~`#EFEFF2`~~ | **No longer used** (merged into `gray` `#F4F4F6`). *v2.1* |
| `line` | ~~`#EADFCF`~~ ~~`#DBDCE1`~~ → **`#EBEBEB`** | Lines and dividers, card borders |
| `line-input` | ~~`#8A8A8A`~~ → **`#707070`** | **Form-field borders**, 4.95:1 on white (WCAG 1.4.11 needs 3:1) |

Avoid navy and blue as brand colors. The prototype's staff app used navy; on this project the staff side uses the same orange, white, black and grays as the sponsor portal so the whole product reads as AAFE.

### Status
Status uses color **plus a text label or icon**, never color alone.

| Meaning | Text | Background | Examples |
| --- | --- | --- | --- |
| Success | `#047857` | `#ECFDF5` | Paid, Named, Checked in |
| Warning | `#B45309` | `#FFFBEB` | Pledged, Missing info, Needs review |
| Danger | `#BE123C` | `#FFF1F2` | Overdue, Import conflict, Deleted |
| Neutral | ~~`#5E5650`~~ ~~`#5C5C5C`~~ → **`#4D4C4C`** | ~~`#F6EEE2`~~ ~~`#EFEFF2`~~ → **`#F4F4F6`** | Open seat, Comp, Draft. ✏️ *v2.1* |

The pale yellow and pale pink above are **status colors**, not page backgrounds; they're the only tinted backgrounds allowed. Do not use orange for warnings; it would read as "brand" and blur with primary actions.

### Contrast (checked) ✏️ *v2.1*
| Pair | Ratio | Verdict |
| --- | --- | --- |
| White on `#C64C28` | 4.7:1 | AA for all text: OK for buttons |
| 🆕 White on hover `#BA4926` | 5.2:1 | AA |
| `#C64C28` on white | 4.7:1 | AA: OK for links |
| `#C64C28` on gray `#F4F4F6` | 4.3:1 | Large or bold text only |
| ~~`#C64C28` on cream `#FBF7F0`~~ | ~~4.4:1~~ | ~~No longer used~~ |
| White on print orange `#E74F26` | 3.8:1 | **Fails** for normal text, so print only |
| 🆕 `#000000` on white / on `#F4F4F6` | 21:1 / 19.1:1 | AAA |
| 🆕 `#4D4C4C` on white / on `#F4F4F6` | 8.6:1 / 7.8:1 | AAA |
| 🆕 `#707070` on white | 4.95:1 | AA (on `#F4F4F6` it's 4.5:1, the minimum, so avoid) |
| 🆕 Input border `#707070` on white | 4.95:1 | Meets the 3:1 rule for field borders |
| ~~`#313131` on white~~ | ~~13.0:1~~ | ~~No longer used (text is black)~~ |
| White on black | 21:1 | AAA |
| `#C64C28` on black | 4.47:1 | **Fails AA for normal text.** Logo, icons, large or bold text only; white for body text on black. ✏️ *Ratio corrected v2.2* |
| `#DB7A55` on white | 3.0:1 | Never for text |

### Dark mode ✏️ *v2.0, v2.1*
Optional; only the staff workspace and check-in need it (dim ballroom).
- **Surfaces:** ~~warm brown `#1A1715` / `#25211E`~~ → neutral near-black **`#121212`** (page) and **`#1E1E1E`** (cards), with `#262626` for hover and `#3A3A3A` for lines.
- **Highlights and tags:** ~~brown `#462316` / `#5C2C1A`~~ → **`#262626`**, with **`#3A3A3A`** for the focus halo. No brown anywhere. ✏️ *v2.3*
- **Staff sidebar's current page:** white tab with dark orange `#8A3118` text in both modes (the light dark-mode orange is unreadable on white). 🆕 *v2.3*
- **Text:** ~~`#FAF6F0`~~ → **`#F5F5F5`**.
- **Orange:** `#C64C28` on dark is only 3.6:1, so use ~~`#E58B66`~~ → **`#E8956F`** for orange text and links (7.1:1 on `#1E1E1E`), and keep `#C64C28` for filled buttons with white text.

## Typography ✏️ *v2.0, v2.1: Poppins for everything, aafe.org's type scale*
| Role | Font | Notes |
| --- | --- | --- |
| Everything | **Poppins** 400 / 600 / 700 | aafe.org loads only these weights |
| ~~Body, tables, forms~~ | ~~Inter 400/500~~ | **No longer used:** replaced by Poppins (v2.0). The staff app no longer loads Inter (PR #96); the guest portal still to do |
| ~~Display~~ | ~~Fraunces (serif)~~ | **No longer used.** No serif in AAFE's brand. **Removed from the staff app** (PR #96); **guest portal still to do** (its headings are still serif). ✏️ *v2.4* |
| Chinese | Noto Sans TC, line height **~1.7** | Sponsor form; the official Chinese logo. 🆕 Line height *v2.1* |
| Korean | Noto Sans KR, line height **~1.7** | Sponsor form; the official Korean logo. 🆕 Line height *v2.1* |
| Spanish | Poppins | |
| Numbers in tables | Poppins with `tabular-nums` | Keeps amounts and counts lined up |
| Codes and IDs | Poppins with `tabular-nums`. ~~Monospace~~ | No second font. ✏️ *v2.3* |

Load Poppins 400, 600 and 700 from Google Fonts. Fallback: `system-ui, sans-serif`.

### Type scale 🆕 *v2.1, from aafe.org*
| Role | Size / line height | Weight | Phone |
| --- | --- | --- | --- |
| Page title | 44px / 56, letter-spacing −1px | Bold 700 | 32 / 40 |
| Section title | 40px / 48 | Bold 700 | 30 / 39 |
| Card title, guest name | 20px / 25 | Bold 700 | same |
| Intro text | 18px / 28 | Regular 400 | same |
| Body | 16px / 26 | Regular 400 | same |
| Buttons | 16px / 24 | Semibold 600 | same |
| Small labels (for example "SEAT 1") | 14px, uppercase | Semibold 600 | same |
| Form inputs | **16px minimum** (prevents iPhone zoom) | Regular 400 | same |

**Where this scale applies (decided Oct 10, 2026):** the **guest portal** will follow it (not yet applied in the code; a separate change). The **staff app** and **iPad check-in app** keep their current, denser sizes, because they show long lists and tables at a desk or the door. Check-in names stay at 20px or larger, readable at arm's length.

~~Old scale (v1.0): page title 30px, section heading 20px, body 16px, tables 14px, labels 12px.~~ Replaced by the scale above for the portal.

Section headings are never larger than the page title, and a card's title is never larger than its section title. 🆕 *v2.0*

## Layout and spacing
- 4px spacing grid (Tailwind default). Cards: 24px padding, 12px radius, 1px `line` (`#EBEBEB`) border, no heavy shadows.
- **Backgrounds:** white `#FFFFFF` and light gray `#F4F4F6` only. ~~Cream `#FBF7F0` bands~~ (no longer used). ✏️ *v2.0, v2.1*
- 🆕 **Section headings:** with a thin orange rule, as on aafe.org ("What We Do", "Latest Stories"). *v2.0*
- Sponsor portal: single column, max width 640px, works at 360px phone width.
- Staff workspace: AAFE orange sidebar (`brand-500`) with white text and icons, the AAFE logo on a white band at the top, and the current page as a white tab with orange text. Content area white, max width 1280px. On screens under 1024px the sidebar opens from a menu button.
- Check-in: iPad landscape first; tap targets at least 44×44px.

## Components
| Component | Spec |
| --- | --- |
| 🆕 Button shape | **Pill: radius 50px, padding 8px 24px, minimum height 44px, 2px border.** Applies to every button, **including tabs, toggles and list buttons** (v2.3). Labels never wrap. ~~Rounded rectangle (6px corners)~~. ✏️ *v2.2, v2.3* |
| 🆕 Small table button | **The one exception:** buttons inside table rows ("Review", "Badge ready", "Approve and send") keep the pill, 2px border and 44px height but use **4px 16px** padding and 12px text, so rows don't overflow. *v2.3* |
| 🆕 Icon button | **Circle, 44px**, 2px gray `#707070` border (text size, dark mode, menu). ~~36px rounded square~~. *v2.3* |
| 🆕 Staff sidebar hover | White at 15% over the orange (a visible lighter orange). ~~`#BA4926`~~ was too close to the sidebar orange. *v2.3* |
| Primary button | Orange `#C64C28` fill and border, white text. **Hover: white fill, orange text** (the orange border keeps the shape). ~~Hover `#A93D1D`~~ ~~Hover `#BA4926` fill~~. **One per screen.** ✏️ *v2.0, v2.1, v2.2* |
| Button text | Sentence case ("Add attendee"). **ALL CAPS only for short calls to action**, for example **SIGN IN** on the staff sign-in page, and aafe.org's "DONATE" and "MORE INFO". 🆕 *v2.0*; SIGN IN applied *v2.2* |
| Secondary button | White fill, **gray border** (`#707070`, 2px), dark text, pill shape. Hover: light gray `#F4F4F6`. ✏️ *v2.2* |
| Destructive button | White fill, danger text and 2px border, pill shape; confirm before acting |
| Input | White, ~~`#EADFCF`~~ ~~`#8A8A8A`~~ **`#707070`** border, 16px text; focus: `brand-500` border plus `brand-100` ring. ✏️ *v2.1* |
| Link | `brand-500`, underlined on hover |
| Focus ring | 2px `#C64C28`, 2px offset, on every interactive element |
| Sidebar (staff) | Orange `#C64C28` background, white text (4.7:1), logo on white at the top, active page = white tab with `brand-700` text |
| Table | White rows, `#EBEBEB` dividers, **hover and selected row `#F4F4F6`** (~~cream~~, ~~peach `#FCF3EE`~~), header in `ink-muted` uppercase. ✏️ *v2.1* |
| Status pill | Status colors above, rounded, with a label |
| Top bar | White with logo on the left; a thin 4px `brand-500` stripe at the top is the main brand accent |
| Prototype banner | Orange on the portal and iPad app; **black** on the staff app (~~charcoal `#313131`~~). ✏️ *v2.1* |
| 🆕 Footer | `black` background, white text, orange logo, as on aafe.org. *v2.0* |

## Logo and imagery
- AAFE's logo and real event photos may be used **only in this private repo and internal reviews** until AAFE gives written approval ([decisions](decisions.md), CLAUDE.md rule 8).
- Anything public, including Demo Day, uses a **placeholder**: an orange square mark plus the text "AAFE Gala" in Poppins.
- 🆕 **Three official layouts** by Greybox, each in English, Spanish, Chinese and Korean. *v2.0*

  | Layout | Use |
  | --- | --- |
  | Horizontal | Mark, then the name in one language; app headers |
  | Stacked | Mark, "AAFE", then the name below; square spaces |
  | Vertical | Mark above "AAFE"; icons and narrow spaces |

- 🆕 **Animated logo:** on screens, the name may cycle through the four languages ("Simple animation allows the logo to show each language translation in digital formats", Greybox). Respect `prefers-reduced-motion`. *v2.0*
- Logo on white: orange version. Logo on orange: white version. Logo on black: orange version. Never recolor or stretch it; keep clear space equal to the height of one circle in the mark.
- No photos where a real attendee's name badge is readable.

## Print (badges and name tags)
- White background, black text, print orange `#E74F26` only for a thin top band or the mark; this saves ink and prints correctly on office printers. ✏️ *v2.0, v2.1*
- Guest name in Poppins 600, at least 28pt; title and organization in Poppins 400, 14pt (~~Inter~~).
- Blank sponsor name tags: same layout with the sponsor name and an empty name line.

## Accessibility checklist
- Text contrast at least 4.5:1 (3:1 for 24px+ or bold 19px+).
- Form-field borders and other UI boundaries at least 3:1.
- Status never shown by color alone.
- All form fields have visible labels, not just placeholders.
- Keyboard navigable, visible focus ring.
- Respect `prefers-reduced-motion`.

## Tailwind tokens ✏️ *v2.1*
```js
// tailwind.config: theme.extend
colors: {
  brand: { 50: '#F4F4F6', 100: '#F8E3D8', 200: '#F0C3AD', 400: '#DB7A55',
           500: '#C64C28', 600: '#BA4926', 700: '#8A3118', print: '#E74F26' },
  ink: { DEFAULT: '#000000', muted: '#4D4C4C', subtle: '#707070' },
  line: { DEFAULT: '#EBEBEB', input: '#707070' },
  gray: { DEFAULT: '#F4F4F6' },
  black: '#000000',
},
fontFamily: {
  sans: ['Poppins', 'system-ui', 'sans-serif'],     // everything
  zh: ['"Noto Sans TC"', 'Poppins', 'sans-serif'],  // line-height ~1.7
  ko: ['"Noto Sans KR"', 'Poppins', 'sans-serif'],  // line-height ~1.7
},
borderRadius: { pill: '9999px' },
```
In the prototype's code (`prototype/shared/src/theme.css`), the older class names `cream-*` and `navy-*` are kept so no screen had to change, but they now resolve to these cool grays.

## Open with AAFE
- Official brand kit (exact hex values, fonts, logo files). These tokens are matched from Greybox's brand boards and aafe.org; replace them if AAFE or Greybox supplies a kit.
- Written approval for public use of the logo (Demo Day).
- Confirm with AAFE at the **Oct 19** meeting that the apps should follow aafe.org's black footer and pill buttons.

## Appendix A: Change log
All times are New York time (ET). Earlier entries are kept as written, even when a later version replaced them.

### Version 2.4: Oct 10, 2026, 2:52 PM ET, by Natalie Walker
**Why:** the staff-app changes went to Aisling as their own PR (#96), and the guest portal was left for later. The notes now say exactly what is applied where.

| # | Section | Before | After |
|---|---|---|---|
| 1 | Typography | "Fraunces removed from the apps"; "Inter isn't loaded" | Removed from the **staff app** (PR #96); **guest portal still to do** |
| 2 | Appendix notes for v2.1–v2.3 | "Applied to the prototype the same day" | "Applied to the staff app in PR #96", with what the portal and iPad pick up from shared styles and what isn't applied yet |

### Version 2.3: Oct 10, 2026, 2:04 PM ET, by Natalie Walker
**Source:** a QA pass on the staff app after v2.2 (all 12 pages, 3 roles, light and dark, 1280 / 1024 / 390).

| # | Section | Before | After | Why |
|---|---|---|---|---|
| 1 | Dark mode | Brown highlights and tags `#462316` | Neutral `#262626`; focus halo `#3A3A3A` | No warm tones, in dark mode too |
| 2 | Dark mode | Current sidebar page: light orange on white, 2.3:1 | Dark orange `#8A3118` on white | Readable |
| 3 | Sidebar | Hover `#BA4926` on `#C64C28` (barely visible) | White 15% overlay | Visible hover |
| 4 | Buttons | Tabs, toggles, list buttons and icon buttons were rectangles, 32–38px | Pills (circles for icons), 44px, 2px border | "Every button" |
| 5 | Buttons | — | Small table buttons: documented exception (4px 16px padding) | Full padding overflowed table rows |
| 6 | Buttons | Labels could wrap inside a pill | Labels never wrap | "Printed check-in list" wrapped to three lines on phones |
| 7 | Typography | Monospace for codes and IDs | Poppins with `tabular-nums` | Poppins for everything |
| 8 | Colors | Peach label and charcoal `#313131` gradient on the sign-in photo; charcoal on badges, logo text and QR codes | White label; black | No warm tones; text is black |
| 9 | Layout | Sponsor page: seats table squeezed into a narrow column at 1280px, buttons cut off | Seats table full width below 1536px | Buttons were clipped |
| 10 | Text | "—" placeholder at 2.8:1 | `#707070` (4.95:1) | Contrast |

**Applied to the staff app in PR #96.**

### Version 2.2: Oct 10, 2026, 1:27 PM ET, by Natalie Walker
**Source:** Natalie's button spec ("SHAPES"), matching aafe.org. Prompted by the staff sign-in button, which was a rounded rectangle and off-brand.

| # | Section | Before | After | Why |
|---|---|---|---|---|
| 1 | Button shape | Rounded rectangle, 6px corners, 1px border on secondary only | Pill: radius 50px, padding 8px 24px, minimum height 44px, 2px border on every button | aafe.org's buttons; 44px is the minimum tap size |
| 2 | Primary hover | Darker orange fill `#BA4926` | White fill, orange text, orange border | Natalie's spec |
| 3 | Secondary | White, light border | White, gray `#707070` 2px border | Natalie's spec; visible at 3:1+ |
| 4 | Caps | Rule only | Applied: **SIGN IN** on the staff sign-in page | Short call to action |
| 5 | Tags | Peach outline on the "Comp" and "to review" tags | Gray outline `#EBEBEB` | No cream or peach |

**Applied to the staff app in PR #96:** shared button styles in `prototype/shared/src/theme.css` (the guest portal and iPad app pick up the same pill shape from the shared styles; the iPad app's large door buttons keep their own shape), SIGN IN on the staff sign-in page, and gray tag outlines. Small table buttons are pills but keep their smaller text.

### Version 2.1: Oct 10, 2026, 1:15 PM ET, by Natalie Walker
**Source:** Natalie's brand spec taken from aafe.org. Prompted by finding cream still showing in the apps (for example, the staff guest-list row highlight).

| # | Section | Before (v2.0) | After (v2.1) | Why |
|---|---|---|---|---|
| 1 | Principles | — | "Only cool grays": no cream, beige or warm gray anywhere | Cream was still showing in the apps |
| 2 | Backgrounds | `#F3F4F8`, `#EFEFF2` | `#F4F4F6` (one light gray) | aafe.org's value |
| 3 | Lines | `#DBDCE1` | `#EBEBEB` | aafe.org's value |
| 4 | Input borders | `#8A8A8A` | `#707070` | aafe.org's value; 4.95:1 |
| 5 | Text | `#313131` / `#5C5C5C` / `#737373` | `#000000` / `#4D4C4C` / `#707070` | aafe.org's heading, secondary and meta colors |
| 6 | Orange hover | `#A93D1D` | `#BA4926` | aafe.org's value; white on it is 5.2:1 |
| 7 | Highlights | `brand-50` peach `#FCF3EE` | `#F4F4F6` gray | Selected rows and tags read as cream |
| 8 | Status | Neutral `#5C5C5C` on `#EFEFF2` | `#4D4C4C` on `#F4F4F6` | New grays |
| 9 | Type scale | v1.0 scale (30 / 20 / 16 / 14 / 12) | aafe.org scale (44 / 40 / 20 / 18 / 16 / 16 / 14) for the portal; staff and iPad keep current sizes | Natalie's spec and decision |
| 10 | Chinese, Korean | No line height set | ~1.7 | Natalie's spec |
| 11 | Banner | Staff banner charcoal | Black | Text and ink are now black |

**Applied in PR #96** (`prototype/shared/src/theme.css`, `tailwind.preset.cjs`): rows 1–8, 10 and 11 in the staff app; the guest portal and iPad app pick up the same colors from the shared styles. Poppins for all staff-app text; the staff app no longer loads Inter or Fraunces. **Not yet applied:** row 9, the portal type scale, and the guest portal's serif headings.

### Version 2.0: Oct 10, 2026, 1:01 PM ET, by Natalie Walker
**Source:** Greybox Creative's AAFE case study (brand boards, logo layouts, website mockups) and aafe.org's live styles. Colors were measured from the images and the site. Prompted by Antonin's PRs #85 (Poppins) and #86 (pill buttons), which turned out to match AAFE's real brand.

| # | Section | Before | After | Why |
|---|---|---|---|---|
| 1 | Neutrals | Warm cream `#FBF7F0` bands; warm grays `#5E5650`, `#7A706A`, `#EADFCF` | AAFE cool gray `#F3F4F8` bands; neutral grays `#5C5C5C`, `#737373`, `#DBDCE1` | aafe.org uses cool gray panels; cream isn't in AAFE's brand |
| 2 | Brand colors | No black | Black `#000000` as the second brand color; footers, one feature band | aafe.org footer and panels; Greybox's dark brand board |
| 3 | Brand colors | One orange | `#C64C28` on screens, `#E74F26` for print | Greybox's boards use `#E74F26`; aafe.org darkened it to `#C64C28` because white on `#E74F26` is only 3.8:1 |
| 4 | Typography | Poppins headings, Inter body | Poppins for all text; no serif | aafe.org loads only Poppins (400, 600, 700) |
| 5 | Components | No button shape; Inter labels | Pill buttons; sentence case, caps only for 1–2 word calls to action | aafe.org's buttons ("Learn More", "DONATE") |
| 6 | Inputs | Border `#EADFCF` (1.3:1) | Border `#8A8A8A` (3.4:1) | WCAG 1.4.11 needs 3:1 for field borders |
| 7 | Status | Neutral pill warm `#F6EEE2` | `#EFEFF2` | Matches the cool gray |
| 8 | Dark mode | Warm brown surfaces; orange text `#E58B66` | Neutral near-black; orange text `#E8956F` | Matches AAFE's black; `#E8956F` is already used in the staff app |
| 9 | Logo | One rule set | Three layouts × four languages; animated name; orange logo on black | Greybox's logo system |
| 10 | Layout | — | Orange section headings with a thin rule; black footer | aafe.org patterns |
| 11 | Typography | — | Headings never larger than their parent | "Your contribution" was oversized in PR #85 |
| 12 | Typography | Korean "still to be added" | Korean included | Added in PR #51; part of AAFE's official logo |

### Version 1.1: Oct 4, 2026, 1:14 PM ET, by Natalie Walker
- Staff sidebar: AAFE orange with white text, the logo on a white band, and the current page as a white tab (PR #14).

### Version 1.0: Oct 3, 2026, 11:51 PM ET, by Natalie Walker
- First version: AAFE orange `#C64C28` and white, charcoal text, no navy; contrast checked; type, layout, components, logo and print rules (PR #14).
