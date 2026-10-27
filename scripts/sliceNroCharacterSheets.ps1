param(
    [Parameter(Mandatory = $true)]
    [string] $SourceRoot,
    [Parameter(Mandatory = $true)]
    [string] $OutputRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$races = @(
    @{ name = 'earth'; file = 'earth.png' },
    @{ name = 'namek'; file = 'namek.png' },
    @{ name = 'saiyan'; file = 'saiyan.png' }
)
$actions = @('dung', 'dichuyen', 'bay', 'tancong', 'chuong')
$outputWidth = 96
$outputHeight = 120
$maxContentWidth = 84
$maxContentHeight = 108

foreach ($race in $races) {
    $sourcePath = Join-Path $SourceRoot $race.file
    if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing source sheet: $sourcePath" }
    $sheet = [System.Drawing.Bitmap]::FromFile($sourcePath)
    try {
        if ($sheet.Width -lt 500 -or $sheet.Height -lt 500) { throw "Unexpected sheet size for $($race.name): $($sheet.Width)x$($sheet.Height)" }
        $cells = @()
        $maxWidth = 1
        $maxHeight = 1
        for ($row = 0; $row -lt 5; $row++) {
            for ($column = 0; $column -lt 5; $column++) {
                $left = [int][Math]::Floor($column * $sheet.Width / 5)
                $right = [int][Math]::Floor(($column + 1) * $sheet.Width / 5)
                $top = [int][Math]::Floor($row * $sheet.Height / 5)
                $bottom = [int][Math]::Floor(($row + 1) * $sheet.Height / 5)
                $minX = $right; $minY = $bottom; $maxX = $left - 1; $maxY = $top - 1
                for ($y = $top; $y -lt $bottom; $y++) {
                    for ($x = $left; $x -lt $right; $x++) {
                        if ($sheet.GetPixel($x, $y).A -gt 12) {
                            if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
                            if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
                        }
                    }
                }
                if ($maxX -lt $minX -or $maxY -lt $minY) { throw "Transparent/empty frame at $($race.name) row $row column $column" }
                $bounds = [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
                if ($bounds.Width -gt $maxWidth) { $maxWidth = $bounds.Width }
                if ($bounds.Height -gt $maxHeight) { $maxHeight = $bounds.Height }
                $cells += [pscustomobject]@{ row = $row; column = $column; bounds = $bounds }
            }
        }

        # Use one scale for every pose of a character, keeping the sprite's size steady in motion.
        $scale = [Math]::Min($maxContentWidth / $maxWidth, $maxContentHeight / $maxHeight)
        for ($i = 0; $i -lt $cells.Count; $i++) {
            $cell = $cells[$i]
            $action = $actions[$cell.row]
            $frameNumber = $cell.column + 1
            $directory = Join-Path (Join-Path $OutputRoot "characters/$($race.name)") $action
            New-Item -ItemType Directory -Force -Path $directory | Out-Null

            $scaledWidth = [Math]::Max(1, [int][Math]::Round($cell.bounds.Width * $scale))
            $scaledHeight = [Math]::Max(1, [int][Math]::Round($cell.bounds.Height * $scale))
            $x = [int][Math]::Floor(($outputWidth - $scaledWidth) / 2)
            $y = $outputHeight - 4 - $scaledHeight
            $canvas = [System.Drawing.Bitmap]::new($outputWidth, $outputHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $graphics = [System.Drawing.Graphics]::FromImage($canvas)
            try {
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
                $graphics.DrawImage($sheet, [System.Drawing.Rectangle]::new($x, $y, $scaledWidth, $scaledHeight), $cell.bounds, [System.Drawing.GraphicsUnit]::Pixel)
                $destination = Join-Path $directory "$action$frameNumber.png"
                $canvas.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
            }
            finally {
                $graphics.Dispose()
                $canvas.Dispose()
            }
        }
    }
    finally {
        $sheet.Dispose()
    }
}
