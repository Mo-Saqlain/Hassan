#requires -Version 5.1
# One-shot converter: erp-frontend/logo.jpeg -> resized PNGs + a Windows .ico,
# with the JPEG's black background keyed out to alpha so the marks are
# transparent for use as favicon, taskbar icon, etc.
#
# The in-app brand mark wraps the image in a dark chip (see app.css `.app-logo`)
# so the white "H" keeps its contrast on light-themed surfaces; this script
# only concerns itself with producing the transparent assets.
#
# Outputs:
#   erp-frontend/public/logo192.png
#   erp-frontend/public/logo512.png
#   erp-frontend/public/logo1024.png
#   erp-frontend/public/favicon.ico        (multi-resolution ICO with PNG-encoded entries)
#   erp-desktop/build-resources/icon.ico   (same ICO for electron-builder)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

# C# helper does the per-pixel chroma-key in tight native code via LockBits —
# PowerShell SetPixel over a 500x500 image is dog-slow.
$csharp = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

public static class LogoProc {
    /// <summary>Returns a copy of the source with near-black pixels keyed to transparent.</summary>
    /// <param name="darkThreshold">Pixels with mean RGB below this are fully transparent.</param>
    /// <param name="featherEnd">Mean RGB between darkThreshold..featherEnd fades alpha 0..255.</param>
    public static Bitmap KeyOutBlack(string srcPath, int darkThreshold, int featherEnd) {
        using (Image src = Image.FromFile(srcPath)) {
            Bitmap bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.InterpolationMode  = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode    = PixelOffsetMode.HighQuality;
                g.DrawImage(src, 0, 0, src.Width, src.Height);
            }
            Rectangle rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            BitmapData data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try {
                int len = data.Stride * data.Height;
                byte[] buf = new byte[len];
                Marshal.Copy(data.Scan0, buf, 0, len);
                int range = Math.Max(1, featherEnd - darkThreshold);
                for (int i = 0; i < len; i += 4) {
                    int b = buf[i];
                    int gv = buf[i + 1];
                    int r = buf[i + 2];
                    int lum = (r + gv + b) / 3;
                    if (lum <= darkThreshold) {
                        buf[i + 3] = 0;     // fully transparent
                    } else if (lum < featherEnd) {
                        buf[i + 3] = (byte)((lum - darkThreshold) * 255 / range);
                    }
                    // else: keep original alpha (255) — opaque
                }
                Marshal.Copy(buf, 0, data.Scan0, len);
            } finally {
                bmp.UnlockBits(data);
            }
            return bmp;
        }
    }

    public static Bitmap Resize(Bitmap src, int size) {
        Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(dst)) {
            g.InterpolationMode  = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode      = SmoothingMode.HighQuality;
            g.PixelOffsetMode    = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.CompositingMode    = CompositingMode.SourceCopy;  // preserve alpha
            g.DrawImage(src, new Rectangle(0, 0, size, size));
        }
        return dst;
    }
}
'@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing -ErrorAction SilentlyContinue

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'erp-frontend\logo.jpeg'
$pub  = Join-Path $root 'erp-frontend\public'
$des  = Join-Path $root 'erp-desktop\build-resources'

if (-not (Test-Path $src)) { throw "Source logo not found at $src" }
if (-not (Test-Path $des)) { New-Item -ItemType Directory -Path $des -Force | Out-Null }

# Threshold tuned for the source JPEG: corners are ~(0,0,0); the white H
# starts around (240,240,240); the blue E peaks around (10,120,255).
# darkThreshold=24 keeps the darkest blue tones; featherEnd=72 smooths
# anti-aliased edges.
$keyed = [LogoProc]::KeyOutBlack($src, 24, 72)
try {
    function Save-Png { param([int]$size, [string]$outPath)
        $r = [LogoProc]::Resize($keyed, $size)
        try { $r.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png) }
        finally { $r.Dispose() }
    }

    # PWA / apple-touch / electron splash
    Save-Png 192  (Join-Path $pub 'logo192.png')
    Save-Png 512  (Join-Path $pub 'logo512.png')
    Save-Png 1024 (Join-Path $pub 'logo1024.png')

    # Build a multi-resolution .ico from PNG-encoded entries (modern ICO spec).
    $icoSizes = @(16, 24, 32, 48, 64, 128, 256)
    $tmpDir = Join-Path $env:TEMP ("he-ico-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    try {
        $entries = foreach ($s in $icoSizes) {
            $p = Join-Path $tmpDir ("$s.png")
            Save-Png $s $p
            [PSCustomObject]@{ Size = $s; Bytes = [System.IO.File]::ReadAllBytes($p) }
        }

        $headerSize = 6 + 16 * $entries.Count
        $ms = New-Object System.IO.MemoryStream
        $bw = New-Object System.IO.BinaryWriter $ms
        try {
            $bw.Write([uint16]0)              # reserved
            $bw.Write([uint16]1)              # type = ICO
            $bw.Write([uint16]$entries.Count) # count

            $offset = $headerSize
            foreach ($e in $entries) {
                $dim = if ($e.Size -ge 256) { 0 } else { $e.Size }  # 0 = 256+
                $bw.Write([byte]$dim)
                $bw.Write([byte]$dim)
                $bw.Write([byte]0)             # palette
                $bw.Write([byte]0)             # reserved
                $bw.Write([uint16]1)           # planes
                $bw.Write([uint16]32)          # bpp
                $bw.Write([uint32]$e.Bytes.Length)
                $bw.Write([uint32]$offset)
                $offset += $e.Bytes.Length
            }
            foreach ($e in $entries) { $bw.Write($e.Bytes) }
            $bw.Flush()
            $bytes = $ms.ToArray()
            [System.IO.File]::WriteAllBytes((Join-Path $pub 'favicon.ico'), $bytes)
            [System.IO.File]::WriteAllBytes((Join-Path $des 'icon.ico'),     $bytes)
        } finally { $bw.Dispose(); $ms.Dispose() }
    } finally {
        Remove-Item -Recurse -Force $tmpDir
    }
} finally { $keyed.Dispose() }

Write-Output ("Wrote:")
Write-Output ("  " + (Join-Path $pub 'logo192.png'))
Write-Output ("  " + (Join-Path $pub 'logo512.png'))
Write-Output ("  " + (Join-Path $pub 'logo1024.png'))
Write-Output ("  " + (Join-Path $pub 'favicon.ico'))
Write-Output ("  " + (Join-Path $des 'icon.ico'))
