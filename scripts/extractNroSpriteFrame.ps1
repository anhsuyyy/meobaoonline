param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [int]$Column = 0,
    [int]$Row = 0,
    [int]$Columns = 4,
    [int]$Rows = 4
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $SourcePath))
try {
    if ($Columns -lt 1 -or $Rows -lt 1 -or $Column -lt 0 -or $Column -ge $Columns -or $Row -lt 0 -or $Row -ge $Rows) {
        throw 'Frame coordinates must point inside the requested grid.'
    }
    $left = [int][Math]::Floor($Column * $source.Width / $Columns)
    $top = [int][Math]::Floor($Row * $source.Height / $Rows)
    $right = [int][Math]::Floor(($Column + 1) * $source.Width / $Columns)
    $bottom = [int][Math]::Floor(($Row + 1) * $source.Height / $Rows)
    $frame = [System.Drawing.Bitmap]::new($right - $left, $bottom - $top, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($frame)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $frame.Width, $frame.Height), $left, $top, $frame.Width, $frame.Height, [System.Drawing.GraphicsUnit]::Pixel)
        $graphics.Dispose()
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force
        $frame.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output "Created $OutputPath ($($frame.Width)x$($frame.Height))"
    }
    finally { $frame.Dispose() }
}
finally { $source.Dispose() }
