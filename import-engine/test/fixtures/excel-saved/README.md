# Exports saved in Excel

Real saves by Excel 16, made with the PowerShell scripts here from invented exports (hard rule 1). They keep their exact
bytes (`.gitattributes`: fixtures are `-text`).

| File | Made from | How it was saved | What it shows |
|---|---|---|---|
| `bom-saved-csv-utf8.csv` | `gala-2026/givelively-export.csv` | `roundtrip.ps1`, CSV UTF-8 | Excel's changes the import takes in stride (Oct 15, #145) |
| `no-bom-saved-csv-utf8.csv` | the same | the same, without the byte-order mark | Non-English names damaged: the upload stops (#145) |
| `gala-2027-excel-csv.csv` | `gala-2027-demo/givelively-export.csv` | `roundtrip-2027.ps1`, plain CSV | Amounts with a trailing space, FALSE in capitals, Windows line endings (Oct 18, Gate 1) |
| `gala-2027-excel-csv-utf8.csv` | the same | `roundtrip-2027.ps1`, CSV UTF-8 | The same, with a byte-order mark |

Used by `import-engine/test/readExport.test.ts` and `prototype/scripts/test-import-excel.mjs` (Gate 1, #146, box 3).
