# Design system

Written by Natalie Walker

AAFE wants the tool to stay on brand: **AAFE orange and white**, matching aafe.org ([requirements](requirements.md): "Branding matching aafe.org"). This file is the single reference for colors, type, and components across the sponsor portal, staff workspace, badges, and check-in.

The tokens below come from AAFE's logo (`AAFE_Logo.jpg`, sampled) and Natalie's prototype theme (`shared/tailwind.preset.cjs`, `shared/src/theme.css`), which uses the same orange as aafe.org.

## Principles
1. **White first, orange for meaning.** Pages are white. Orange marks the one main action on a screen, the brand mark, and focus. If everything is orange, nothing stands out.
2. **Readable before decorative.** Sponsors fill the form on phones; staff work at the check-in desk on an iPad in a dim room. Every text color meets WCAG AA (4.5:1).
3. **Plain and mainstream.** Tailwind tokens and a short list of components a future partner can maintain (CLAUDE.md rule 9).

## Color

### Brand
| Token | Hex | Use |
| --- | --- | --- |
| `brand-500` | `#C64C28` | **AAFE orange.** Primary buttons, links, active nav, focus ring, logo mark |
| `brand-600` | `#A93D1D` | Hover and pressed state of primary buttons |
| `brand-700` | `#8A3118` | Orange text on light orange backgrounds |
| `brand-400` | `#DB7A55` | Decorative only (icons, chart fills). **Not for text on white** (3.0:1) |
| `brand-200` | `#F0C3AD` | Borders on selected items |
| `brand-100` | `#F8E3D8` | Selected row, focus halo |
| `brand-50` | `#FCF3EE` | Subtle highlight background (info callouts, "your seats" panel) |
| `white` | `#FFFFFF` | **Page and card background.** Text on orange |

### Neutrals
| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#313131` | Body text and headings (the charcoal aafe.org uses) |
| `ink-muted` | `#5E5650` | Secondary text, table headers, labels |
| `ink-subtle` | `#7A706A` | Placeholder and helper text (minimum for text: 4.8:1) |
| `line` | `#EADFCF` | Borders, dividers |
| `cream` | `#FBF7F0` | Optional warm band behind a section; keep main surfaces white |

Avoid navy and blue as brand colors. The prototype's staff app used navy; on this project the staff side uses the same orange and white as the sponsor portal so the whole product reads as AAFE.

### Status
Status uses color **plus a text label or icon**, never color alone.

| Meaning | Text | Background | Examples |
| --- | --- | --- | --- |
| Success | `#047857` | `#ECFDF5` | Paid, Named, Checked in |
| Warning | `#B45309` | `#FFFBEB` | Pledged, Missing info, Needs review |
| Danger | `#BE123C` | `#FFF1F2` | Overdue, Import conflict, Deleted |
| Neutral | `#5E5650` | `#F6EEE2` | Open seat, Comp, Draft |

Do not use orange for warnings; it would read as "brand" and blur with primary actions.

### Contrast (checked)
| Pair | Ratio | Verdict |
| --- | --- | --- |
| White on `#C64C28` | 4.7:1 | AA for all text: OK for buttons |
| `#C64C28` on white | 4.7:1 | AA: OK for links |
| `#C64C28` on cream `#FBF7F0` | 4.4:1 | Large or bold text only |
| `#DB7A55` on white | 3.0:1 | Never for text |
| `#313131` on white | 13.0:1 | AAA |

### Dark mode
Optional; only the staff workspace and check-in need it (dim ballroom). Surfaces `#1A1715` / `#25211E`, text `#FAF6F0`. Orange `#C64C28` on dark is only 3.8:1, so in dark mode use **`#E58B66`** for orange text and links (7.0:1) and keep `#C64C28` for filled buttons with white text.

## Typography
| Role | Font | Notes |
| --- | --- | --- |
| Headings | **Poppins** 600 | Matches the AAFE wordmark |
| Body, tables, forms | **Inter** 400/500 | Readable at small sizes, tabular numbers |
| Chinese | Noto Sans TC | Sponsor form |
| Korean | Noto Sans KR | Sponsor form (Korean still to be added) |
| Spanish | Inter | |

Load from Google Fonts. Fallback: `system-ui, sans-serif`.

| Size | px | Use |
| --- | --- | --- |
| `text-3xl` | 30 | Page title |
| `text-xl` | 20 | Section heading |
| `text-base` | 16 | Body; **minimum for form inputs** (prevents iPhone zoom) |
| `text-sm` | 14 | Tables, secondary text |
| `text-xs` | 12 | Labels and badges, uppercase with letter spacing |

Check-in screen: names at 20px or larger so they can be read at arm's length.

## Layout and spacing
- 4px spacing grid (Tailwind default). Cards: 24px padding, 12px radius, 1px `line` border, no heavy shadows.
- Sponsor portal: single column, max width 640px, works at 360px phone width.
- Staff workspace: white sidebar with orange active item, content max width 1280px.
- Check-in: iPad landscape first; tap targets at least 44×44px.

## Components
| Component | Spec |
| --- | --- |
| Primary button | `brand-500` fill, white text, `brand-600` on hover. **One per screen** |
| Secondary button | White fill, `line` border, `ink` text |
| Destructive button | White fill, danger text and border; confirm before acting |
| Input | White, `line` border, 16px text; focus: `brand-500` border plus `brand-100` ring |
| Link | `brand-500`, underlined on hover |
| Focus ring | 2px `#C64C28`, 2px offset, on every interactive element |
| Table | White rows, `line` dividers, `brand-50` for selected row, header in `ink-muted` uppercase |
| Status pill | Status colors above, rounded, `text-xs` with label |
| Top bar | White with logo on the left; a thin 4px `brand-500` stripe at the top is the main brand accent |

## Logo and imagery
- AAFE's logo and real event photos may be used **only in this private repo and internal reviews** until AAFE gives written approval ([decisions](decisions.md), CLAUDE.md rule 8).
- Anything public, including Demo Day, uses a **placeholder**: an orange square mark plus the text "AAFE Gala" in Poppins.
- Logo on white: orange version. Logo on orange: white version. Never recolor or stretch it; keep clear space equal to the height of one circle in the mark.
- No photos where a real attendee's name badge is readable.

## Print (badges and name tags)
- White background, `ink` text, orange used only for a thin top band or the mark; this saves ink and prints correctly on office printers.
- Guest name in Poppins 600, at least 28pt; title and organization in Inter 14pt.
- Blank sponsor name tags: same layout with the sponsor name and an empty name line.

## Accessibility checklist
- Text contrast at least 4.5:1 (3:1 for 24px+ or bold 19px+).
- Status never shown by color alone.
- All form fields have visible labels, not just placeholders.
- Keyboard navigable, visible focus ring.
- Respect `prefers-reduced-motion`.

## Tailwind tokens
```js
// tailwind.config: theme.extend
colors: {
  brand: { 50: '#FCF3EE', 100: '#F8E3D8', 200: '#F0C3AD', 400: '#DB7A55',
           500: '#C64C28', 600: '#A93D1D', 700: '#8A3118' },
  ink: { DEFAULT: '#313131', muted: '#5E5650', subtle: '#7A706A' },
  line: '#EADFCF',
  cream: '#FBF7F0',
},
fontFamily: {
  sans: ['Poppins', 'system-ui', 'sans-serif'],
  body: ['Inter', 'system-ui', 'sans-serif'],
  zh: ['"Noto Sans TC"', 'Inter', 'sans-serif'],
  ko: ['"Noto Sans KR"', 'Inter', 'sans-serif'],
},
```

## Open with AAFE
- Official brand kit (exact hex values, fonts, logo files). These tokens are matched from the logo and aafe.org; replace them if AAFE supplies a kit.
- Written approval for public use of the logo (Demo Day).
