#requires -Version 5.1
# One-shot converter: a source logo -> resized PNGs + a Windows .ico for use as
# favicon, taskbar icon, electron app icon, and the login-screen brand mark.
#
# Source selection (first match wins):
#   1. apps/erp-frontend/logo.png   — an already-transparent PNG. Used as-is; the
#                                 black chroma-key is SKIPPED (it would eat the
#                                 logo's own dark tones and there's no black
#                                 backdrop to remove).
#   2. apps/erp-frontend/logo.jpeg  — legacy JPEG with a black backdrop. The
#                                 backdrop is keyed out to alpha (luminance key).
#
# Outputs:
#   apps/erp-frontend/public/logo192.png
#   apps/erp-frontend/public/logo512.png
#   apps/erp-frontend/public/logo1024.png
#   apps/erp-frontend/public/favicon.ico        (multi-resolution ICO with PNG-encoded entries)
#   apps/erp-desktop/build-resources/icon.ico   (same ICO for electron-builder)

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

    /// <summary>Loads an image into a 32bpp ARGB bitmap, preserving its existing alpha.</summary>
    public static Bitmap LoadArgb(string srcPath) {
        using (Image src = Image.FromFile(srcPath)) {
            Bitmap bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.InterpolationMode  = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode    = PixelOffsetMode.HighQuality;
                g.DrawImage(src, 0, 0, src.Width, src.Height);
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

$root    = Split-Path -Parent $PSScriptRoot
$srcPng  = Join-Path $root 'apps\erp-frontend\logo.png'
$srcJpeg = Join-Path $root 'apps\erp-frontend\logo.jpeg'
$pub     = Join-Path $root 'apps\erp-frontend\public'
$des     = Join-Path $root 'apps\erp-desktop\build-resources'

if (-not (Test-Path $des)) { New-Item -ItemType Directory -Path $des -Force | Out-Null }

if (Test-Path $srcPng) {
    # Already-transparent PNG: load as-is, no chroma-key.
    Write-Output ("Source: " + $srcPng + " (transparent PNG, no key)")
    $keyed = [LogoProc]::LoadArgb($srcPng)
} elseif (Test-Path $srcJpeg) {
    # Legacy JPEG: key out the black backdrop. Threshold tuned for that file —
    # corners ~(0,0,0), white H ~(240,240,240), blue E peaks ~(10,120,255);
    # darkThreshold=24 keeps the darkest blue, featherEnd=72 smooths edges.
    Write-Output ("Source: " + $srcJpeg + " (JPEG, black-key)")
    $keyed = [LogoProc]::KeyOutBlack($srcJpeg, 24, 72)
} else {
    throw "Source logo not found at $srcPng or $srcJpeg"
}
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
