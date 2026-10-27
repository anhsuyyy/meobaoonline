param(
    [string] $SourceRoot = 'client/public/assets/nro/source/normal',
    [string] $OutputRoot = 'client/public/assets/nro/generated/mobs'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sourceRootPath = (Resolve-Path -LiteralPath $SourceRoot).Path
$outputRootPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputRoot))
$templateFile = Join-Path (Get-Location) 'shared/nro/maps/mob-templates.json'
$templateData = Get-Content -Raw -LiteralPath $templateFile | ConvertFrom-Json
$mobIdList = [System.Collections.Generic.List[int]]::new()
foreach ($template in $templateData) { $mobIdList.Add([int]$template.id) }
$mobIds = @($mobIdList | Sort-Object -Unique)
$scale = 2
$frameWidth = 64
$frameHeight = 80
$actions = @('dung', 'dichuyen', 'tancong', 'chet')

function New-TransparentFrame([int] $mobId, $frameData, $sprites, [System.Drawing.Bitmap] $atlas) {
    $frame = [System.Drawing.Bitmap]::new($frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($frame)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    try {
        foreach ($piece in $frameData) {
            $sprite = $sprites | Where-Object { [int]$_.id -eq [int]$piece.sprite_id } | Select-Object -First 1
            if ($null -eq $sprite) { continue }
            $destination = [System.Drawing.Rectangle]::new([int](32 + $piece.dx), [int](80 + $piece.dy), [int]$sprite.w, [int]$sprite.h)
            $source = [System.Drawing.Rectangle]::new([int]$sprite.x, [int]$sprite.y, [int]$sprite.w, [int]$sprite.h)
            $graphics.DrawImage($atlas, $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)
        }
        return $frame
    } catch {
        $frame.Dispose()
        throw
    } finally {
        $graphics.Dispose()
    }
}

function Save-ScaledFrame([System.Drawing.Bitmap] $source, [string] $path, [float] $opacity = 1,
    [float] $scaleX = 1, [float] $scaleY = 1, [int] $shiftY = 0) {
    $canvas = [System.Drawing.Bitmap]::new($frameWidth * $scale, $frameHeight * $scale, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    try {
        $drawWidth = [int]($canvas.Width * $scaleX)
        $drawHeight = [int]($canvas.Height * $scaleY)
        $destination = [System.Drawing.Rectangle]::new(
            [int](($canvas.Width - $drawWidth) / 2),
            [int](($canvas.Height - $drawHeight) + $shiftY),
            $drawWidth, $drawHeight)
        if ($opacity -lt 1) {
            $matrix = [System.Drawing.Imaging.ColorMatrix]::new()
            $matrix.Matrix33 = $opacity
            $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
            $attributes.SetColorMatrix($matrix)
            try {
                $graphics.DrawImage($source,
                    $destination,
                    0, 0, $source.Width, $source.Height,
                    [System.Drawing.GraphicsUnit]::Pixel, $attributes)
            } finally { $attributes.Dispose() }
        } else {
            $graphics.DrawImage($source, $destination)
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
        $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $canvas.Dispose() }
}

$generated = 0
$missing = [System.Collections.Generic.List[int]]::new()
$generatedMobIds = [System.Collections.Generic.List[int]]::new()
foreach ($mobId in $mobIds) {
    $dataPath = Join-Path $sourceRootPath "monster_data/$mobId.json"
    $atlasPath = Join-Path $sourceRootPath "image/1/monster/$mobId.png"
    if (-not (Test-Path -LiteralPath $dataPath) -or -not (Test-Path -LiteralPath $atlasPath)) { $missing.Add($mobId); continue }
    $data = Get-Content -Raw -LiteralPath $dataPath | ConvertFrom-Json
    $atlas = [System.Drawing.Bitmap]::FromFile($atlasPath)
    $sourceFrames = [System.Collections.Generic.List[System.Drawing.Bitmap]]::new()
    try {
        foreach ($frameData in $data.frames) { $sourceFrames.Add((New-TransparentFrame $mobId $frameData $data.sprites $atlas)) }
        if ($sourceFrames.Count -lt 1) { $missing.Add($mobId); continue }
        $generatedMobIds.Add($mobId)
        $idleIndices = @(0, 1, 0, 2, 0)
        $walkIndices = @(0, 1, 2, 3, 4)
        $attackIndices = @(5, 6, 7, 8, 9)
        for ($index = 0; $index -lt 5; $index++) {
            foreach ($spec in @(
                @{ folder = 'dung'; name = 'dung'; source = $idleIndices[$index]; opacity = 1.0 },
                @{ folder = 'dichuyen'; name = 'dichuyen'; source = $walkIndices[$index]; opacity = 1.0 },
                @{ folder = 'tancong'; name = 'tancong'; source = $attackIndices[$index]; opacity = 1.0 }
            )) {
                $frameIndex = [int]$spec.source
                if ($frameIndex -ge $sourceFrames.Count) { $frameIndex = $sourceFrames.Count - 1 }
                $path = Join-Path $outputRootPath "$mobId/$($spec.folder)/$($spec.name)$($index + 1).png"
                Save-ScaledFrame $sourceFrames[$frameIndex] $path ([float]$spec.opacity)
                $generated++
            }
            # Mob templates do not contain a death pose; fade the original last pose
            # across five independent crisp PNGs to make the death state readable.
            $deathIndex = $sourceFrames.Count - 1
            $deathOpacity = [float](1 - ($index * 0.24))
            $deathPath = Join-Path $outputRootPath "$mobId/chet/chet$($index + 1).png"
            $collapseScaleX = [float](1 - ($index * 0.045))
            $collapseScaleY = [float](1 - ($index * 0.13))
            Save-ScaledFrame $sourceFrames[$deathIndex] $deathPath $deathOpacity $collapseScaleX $collapseScaleY ($index * 5)
            $generated++
        }
    } finally {
        foreach ($frame in $sourceFrames) { $frame.Dispose() }
        $atlas.Dispose()
    }
}
$manifestPath = Join-Path $outputRootPath 'animation-manifest.json'
$manifestJson = $generatedMobIds.ToArray() | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $generated standalone 2x PNG mob frames for $($mobIds.Count - $missing.Count) source mobs. Missing source: $($missing -join ', ')."
