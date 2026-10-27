param([int[]]$MobIds = @(4, 7, 10))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sourceRoot = Join-Path (Get-Location) 'client/public/assets/nro/source/normal'
$cellW = 64; $cellH = 80; $scale = 2; $columns = 12
$sheet = [System.Drawing.Bitmap]::new($columns * $cellW * $scale, $MobIds.Count * $cellH * $scale)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
try {
    for ($r = 0; $r -lt $MobIds.Count; $r++) {
        $mobId = $MobIds[$r]
        $data = Get-Content -Raw (Join-Path $sourceRoot "monster_data/$mobId.json") | ConvertFrom-Json
        $atlas = [System.Drawing.Bitmap]::FromFile((Join-Path $sourceRoot "image/1/monster/$mobId.png"))
        try {
            for ($i = 0; $i -lt [Math]::Min($columns, $data.frames.Count); $i++) {
                $frame = [System.Drawing.Bitmap]::new($cellW, $cellH)
                $fg = [System.Drawing.Graphics]::FromImage($frame)
                $fg.Clear([System.Drawing.Color]::Transparent)
                $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                try {
                    foreach ($piece in $data.frames[$i]) {
                        $sprite = $data.sprites | Where-Object { $_.id -eq $piece.sprite_id } | Select-Object -First 1
                        if ($null -eq $sprite) { continue }
                        $destinationRect = [System.Drawing.Rectangle]::new([int](32 + $piece.dx), [int](80 + $piece.dy), [int]$sprite.w, [int]$sprite.h)
                        $sourceRect = [System.Drawing.Rectangle]::new([int]$sprite.x, [int]$sprite.y, [int]$sprite.w, [int]$sprite.h)
                        $fg.DrawImage($atlas, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
                    }
                    $g.DrawImage($frame, [System.Drawing.Rectangle]::new($i * $cellW * $scale, $r * $cellH * $scale, $cellW * $scale, $cellH * $scale))
                } finally { $fg.Dispose(); $frame.Dispose() }
            }
        } finally { $atlas.Dispose() }
    }
    $out = Join-Path $env:TEMP 'nro-mob-source-frames.png'
    $sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output $out
} finally { $g.Dispose(); $sheet.Dispose() }
