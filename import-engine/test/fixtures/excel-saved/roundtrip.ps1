# Opens the invented Give Lively export in Excel and saves it back as CSV, the way a staff member would
# ("open the export in Excel, fix a name, save"). Synthetic data only (import-engine/test/fixtures/gala-2026).
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
Copy-Item 'D:\L3 Cycle 3 Capstone\import-engine\test\fixtures\gala-2026\givelively-export.csv' (Join-Path $dir 'clean.csv') -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  foreach ($out in @(@{ name = 'excel-csv.csv'; format = 6 }, @{ name = 'excel-csv-utf8.csv'; format = 62 })) {
    $wb = $xl.Workbooks.Open((Join-Path $dir 'clean.csv'))
    $wb.SaveAs((Join-Path $dir $out.name), $out.format)
    $wb.Close($false)
    "saved $($out.name)"
  }
} finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
