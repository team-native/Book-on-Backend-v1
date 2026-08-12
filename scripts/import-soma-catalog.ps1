param(
  [string]$WorkbookPath = "",
  [string]$OutputJson = ".\data\soma-catalog.ndjson"
)

if (-not $WorkbookPath) {
  $WorkbookPath = (Get-ChildItem -File -Filter "*.xls" | Select-Object -First 1).FullName
}
$resolvedWorkbook = (Resolve-Path $WorkbookPath).Path
$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputJson)
New-Item -ItemType Directory -Force -Path (Split-Path $resolvedOutput) | Out-Null

function Get-Category([string]$callNo) {
  if ($callNo -match "^\s*([0-9])") {
    switch ($Matches[1]) {
      "0" { return @("0", "총류") }
      "1" { return @("1", "철학") }
      "2" { return @("2", "종교") }
      "3" { return @("3", "사회과학") }
      "4" { return @("4", "자연과학") }
      "5" { return @("5", "기술과학") }
      "6" { return @("6", "예술") }
      "7" { return @("7", "언어") }
      "8" { return @("8", "문학") }
      "9" { return @("9", "역사") }
    }
  }
  return @($null, $null)
}

function Read-Text($values, [int]$rows, [int]$cols, [int]$row, [int]$col) {
  if ($col -lt 1 -or $col -gt $cols -or $row -lt 1 -or $row -gt $rows) { return "" }
  if ($rows -eq 1 -and $cols -eq 1) { return ([string]$values).Trim() }
  return ([string]$values[$row, $col]).Trim()
}

$writer = [System.IO.StreamWriter]::new($resolvedOutput, $false, [System.Text.UTF8Encoding]::new($false))
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$count = 0

try {
  $workbook = $excel.Workbooks.Open($resolvedWorkbook, 0, $true)
  foreach ($sheet in $workbook.Worksheets) {
    $used = $sheet.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    $values = $used.Value2

    for ($r = 1; $r -le $rows; $r++) {
      $regCol = 0
      $regCode = ""
      for ($c = 1; $c -le $cols; $c++) {
        $candidate = Read-Text $values $rows $cols $r $c
        if ($candidate -match "^[A-Za-z]{1,4}[0-9]{4,}$") {
          $regCol = $c
          $regCode = $candidate
          break
        }
      }
      if ($regCol -eq 0) { continue }

      $title = Read-Text $values $rows $cols $r ($regCol + 1)
      $author = Read-Text $values $rows $cols $r ($regCol + 2)
      $publisher = Read-Text $values $rows $cols $r ($regCol + 3)
      $pubYear = Read-Text $values $rows $cols $r ($regCol + 4)
      $callNo = Read-Text $values $rows $cols $r ($regCol + 5)
      $status = ""
      $registeredAt = ""
      for ($c = $regCol + 8; $c -le [Math]::Min($cols, $regCol + 13); $c++) {
        $text = Read-Text $values $rows $cols $r $c
        if (-not $status -and $text) { $status = $text }
        if ($text -match "^[0-9]{4}-[0-9]{2}-[0-9]{2}$") { $registeredAt = $text }
      }

      $category = Get-Category $callNo
      $item = [ordered]@{
        regCode = $regCode
        title = $title
        author = $author
        publisher = $publisher
        pubYear = $pubYear
        callNo = $callNo
        categoryCode = $category[0]
        categoryName = $category[1]
        status = $status
        registeredAt = $registeredAt
      }
      $writer.WriteLine(($item | ConvertTo-Json -Compress))
      $count += 1
    }
  }
} finally {
  $writer.Close()
  if ($workbook) { $workbook.Close($false) }
  $excel.Quit()
  if ($workbook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Output "Exported $count rows to $resolvedOutput"
Write-Output "Run: npm run db:migrate; npm run dls:catalog:import -- `"$resolvedOutput`""
