# SessionStart hook: warn Claude when CODEBASE_MAP.md is stale.
#
# Compares CODEBASE_MAP.md's last-write time against every backend/frontend/
# electron source file. If any source is newer (i.e. code changed since the map
# was generated), it emits a SessionStart additionalContext note asking Claude
# to regenerate the map. Silent (no output) when the map is current, so it never
# adds noise on days with no code changes.
#
# Never throws — any failure exits 0 silently so a bad check can't disrupt a session.

$ErrorActionPreference = 'Stop'
try {
    $root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $map  = Join-Path $root 'CODEBASE_MAP.md'

    function Emit($msg) {
        @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $msg } } |
            ConvertTo-Json -Compress -Depth 5
    }

    if (-not (Test-Path $map)) {
        Emit 'CODEBASE_MAP.md is missing. If working on this codebase, generate it (a module + key-files reference) before relying on it.'
        exit 0
    }

    $mapTime = (Get-Item $map).LastWriteTime
    $srcDirs = @('erp-backend\src', 'erp-frontend\src', 'erp-desktop\src') |
        ForEach-Object { Join-Path $root $_ } |
        Where-Object { Test-Path $_ }

    $changed = Get-ChildItem -Path $srcDirs -Recurse -File -Include *.ts, *.js -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $mapTime } |
        Select-Object -First 1

    if ($changed) {
        Emit ('CODEBASE_MAP.md is STALE - source files have changed since it was generated (e.g. ' +
              $changed.Name + '). Before relying on it as the codebase reference, regenerate it: read CODEBASE_MAP.md, ' +
              'refresh the sections for whatever changed, and update the commit/date stamp at the top.')
    }
    # else: up to date -> no output (silent success)
    exit 0
}
catch {
    # Best-effort only; never disrupt the session.
    exit 0
}
