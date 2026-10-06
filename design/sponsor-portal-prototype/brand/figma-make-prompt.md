# Figma Make prompt: apply AAFE identity to the prototype

Paste into Figma Make (one block):

```
Re-skin the whole prototype (Sponsor portal, Check-in, Seating) to match AAFE's real brand from aafe.org. Keep all layouts, flows, Liquid Glass chrome and 4 languages. Only change the visual identity:

COLOR
- Primary orange: #C64C28 everywhere we now use #E0532A (buttons, links, accents, progress ring, chips).
- Hover/pressed #A93D1D. Text #313131, secondary #5E5650, borders #EADFCF. Pages and cards white.
- Status (always with a label/icon): success #047857 on #ECFDF5, warning #B45309 on #FFFBEB, danger #BE123C on #FFF1F2, neutral #5E5650 on #F6EEE2.

TYPE (team design.md)
- Headings: Poppins 600. Body, forms, tables: Inter 400/500. Remove Fraunces and Noto Sans.
- Chinese: Noto Sans TC (Traditional). Korean: Noto Sans KR.
- Text color #313131, secondary #5E5650. Body 16px minimum (inputs 16px so iPhone doesn't zoom).
- Buttons: Poppins 600, sentence case, pill shape (radius 50px).

SIGNATURE DETAILS (from aafe.org)
- Short orange accent bar (82 x 4px, #C64C28) above the main page title on each home screen.
- Section titles can use a thin 2px orange rule running to the right of the title.
- Text links in orange #C64C28, weight 600–700.

LOGO
- Use the AAFE mark (the orange house/people icon) + "Asian Americans for Equality" wordmark in the top bar instead of the triangle "AAFE" placeholder. I'll upload the logo PNG.

Do not change content, screens, spacing system or interactions.
```

After it runs, upload `logos/aafe-logo-orange.png` (on light backgrounds) and `logos/aafe-logo-white.png` (on dark backgrounds) when Figma asks for the logo.
