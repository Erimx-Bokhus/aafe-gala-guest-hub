# Opens Natalie's invented 2027 export (gala-2027-demo) in Excel and saves it back as CSV both ways a staff member
# might ("open the export in Excel, fix something, save"): plain CSV and CSV UTF-8. Gate 1 (#146), box 3; the same
# steps as roundtrip.ps1, which does the 2026 export. Synthetic data only.
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$source = Join-Path $dir '..\gala-2027-demo\givelively-export.csv'
$copy = Join-Path $dir 'gala-2027-clean.csv'
Copy-Item $source $copy -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  foreach ($out in @(@{ name = 'gala-2027-excel-csv.csv'; format = 6 }, @{ name = 'gala-2027-excel-csv-utf8.csv'; format = 62 })) {
    $wb = $xl.Workbooks.Open($copy)
    $wb.SaveAs((Join-Path $dir $out.name), $out.format)
    $wb.Close($false)
    "saved $($out.name)"
  }
} finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  Remove-Item $copy -ErrorAction SilentlyContinue
}
