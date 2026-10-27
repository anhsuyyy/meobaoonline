param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $SourcePath))
$frameWidth = 64
$frameHeight = 80
$columns = 4
$rows = 4

# The generated source is a 4x4 sheet: idle, run, upright flight and attack/cast.
$sourceCells = @(
    @(0, 0), @(0, 1), @(0, 2), @(0, 3),
    @(1, 0), @(1, 1), @(1, 2), @(1, 3),
    @(2, 0), @(2, 1), @(2, 2), @(2, 3),
    @(3, 0), @(3, 1), @(3, 2), @(3, 3)
)
$frames = [System.Collections.Generic.List[object]]::new()
$maxContentWidth = 0
$maxContentHeight = 0

foreach ($cell in $sourceCells) {
    $row = [int]$cell[0]
    $column = [int]$cell[1]
    $left = [int][Math]::Floor($column * $source.Width / 4)
    $top = [int][Math]::Floor($row * $source.Height / 4)
    $right = [int][Math]::Floor(($column + 1) * $source.Width / 4)
    $bottom = [int][Math]::Floor(($row + 1) * $source.Height / 4)
    $crop = [System.Drawing.Bitmap]::new($right - $left, $bottom - $top, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $cropGraphics = [System.Drawing.Graphics]::FromImage($crop)
    $cropGraphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $crop.Width, $crop.Height), $left, $top, $crop.Width, $crop.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $cropGraphics.Dispose()

    $minX = $crop.Width
    $minY = $crop.Height
    $maxX = -1
    $maxY = -1
    for ($y = 0; $y -lt $crop.Height; $y++) {
        for ($x = 0; $x -lt $crop.Width; $x++) {
            if ($crop.GetPixel($x, $y).A -gt 8) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt $minX -or $maxY -lt $minY) {
        $crop.Dispose()
        throw "Source frame ($row, $column) is empty or has no transparent background."
    }

    $contentWidth = $maxX - $minX + 1
    $contentHeight = $maxY - $minY + 1
    $maxContentWidth = [Math]::Max($maxContentWidth, $contentWidth)
    $maxContentHeight = [Math]::Max($maxContentHeight, $contentHeight)
    $frames.Add([pscustomobject]@{
        Bitmap = $crop
        SourceRect = [System.Drawing.Rectangle]::new($minX, $minY, $contentWidth, $contentHeight)
    })
}

# One scale for every gameplay frame avoids the apparent zooming caused by
# independently fitting wide running/flying poses into their individual cells.
$scale = [Math]::Min(56 / $maxContentWidth, 72 / $maxContentHeight)
$sheet = [System.Drawing.Bitmap]::new($frameWidth * $columns, $frameHeight * $rows, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

for ($index = 0; $index -lt $frames.Count; $index++) {
    $frame = $frames[$index]
    $drawWidth = [Math]::Max(1, [int][Math]::Round($frame.SourceRect.Width * $scale))
    $drawHeight = [Math]::Max(1, [int][Math]::Round($frame.SourceRect.Height * $scale))
    $column = $index % $columns
    $row = [int][Math]::Floor($index / $columns)
    $destinationX = $column * $frameWidth + [int][Math]::Floor(($frameWidth - $drawWidth) / 2)
    $destinationY = $row * $frameHeight + $frameHeight - 3 - $drawHeight
    $destination = [System.Drawing.Rectangle]::new($destinationX, $destinationY, $drawWidth, $drawHeight)
    $graphics.DrawImage($frame.Bitmap, $destination, $frame.SourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $frame.Bitmap.Dispose()
}

$null = New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force
$sheet.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$sheet.Dispose()
$source.Dispose()
Write-Output "Created $OutputPath ($($frameWidth * $columns)x$($frameHeight * $rows), 16 frames, uniform scale $([Math]::Round($scale, 3)))"
