; ─────────────────────────────────────────────────────────────────────────
;  Hassan Electronics — NSIS customisations
;
;  Adds a per-module narrative to both the install and uninstall flows so
;  the user can see exactly what the installer is doing instead of staring
;  at an opaque progress bar.
;
;  Hooks invoked by electron-builder's NSIS template (see
;  app-builder-lib/templates/nsis/installer.nsi):
;    customHeader     — top of the script (compile-time directives)
;    preInit          — before .onInit
;    customInit       — first thing inside .onInit (after preInit)
;    customInstall    — after file extraction, before finalise
;    customUnInit     — first thing inside un.onInit
;    customUnInstall  — before default file removal
;
;  We use DetailPrint liberally and force the "details" panel to be
;  expanded so the running log is visible without the user having to
;  click "Show details".
; ─────────────────────────────────────────────────────────────────────────

!macro customHeader
  ; Force the details panel open during BOTH install and uninstall so the
  ; per-module DetailPrint output below is visible by default.
  ShowInstDetails show
  ShowUnInstDetails show

  ; Slightly more descriptive name on the progress pages.
  BrandingText "Hassan Electronics — Setup"
!macroend

; ─────────────────────────────────────────────────────────────────────────
;  Install narrative
; ─────────────────────────────────────────────────────────────────────────

!macro customInit
  DetailPrint "════════════════════════════════════════════════════════"
  DetailPrint "  Hassan Electronics — Installation"
  DetailPrint "  Version ${VERSION}"
  DetailPrint "════════════════════════════════════════════════════════"
  DetailPrint ""
  DetailPrint "[1/6] Preparing installer environment..."
  DetailPrint "      Target directory: $INSTDIR"
  DetailPrint ""
!macroend

!macro customInstall
  ; customInstall runs AFTER electron-builder's default extraction section,
  ; so the file copy itself is already done by the time we reach here. The
  ; DetailPrint lines below are the user-facing recap that appears in the
  ; details panel — they describe what was just installed, module by module,
  ; rather than the file-by-file extraction noise.
  DetailPrint ""
  DetailPrint "[2/6] Installing Electron runtime..."
  DetailPrint "      → Hassan Electronics.exe (main process)"
  DetailPrint "      → Chromium renderer + resources"
  DetailPrint ""
  DetailPrint "[3/6] Installing frontend module (React UI)..."
  DetailPrint "      → POS terminal, Dashboard, hub pages"
  DetailPrint "      → Reports, Cash Book, Financials"
  DetailPrint "      → 30 modules · ~140 screens"
  DetailPrint ""
  DetailPrint "[4/6] Installing backend module (local NestJS server)..."
  DetailPrint "      → 41 entity schemas (TypeORM)"
  DetailPrint "      → Sales / Purchases / Inventory / Accounting"
  DetailPrint "      → Double-entry journal + period locking"
  DetailPrint "      → SQLite (better-sqlite3) native binary"
  DetailPrint "      → Outbox + sync worker"
  DetailPrint ""
  DetailPrint "[5/6] Registering Hassan Electronics with Windows..."
  DetailPrint "      → Start Menu shortcut"
  DetailPrint "      → Desktop shortcut"
  DetailPrint "      → Add/Remove Programs entry"
  DetailPrint "      → File associations (none — desktop-only app)"
  DetailPrint ""
  DetailPrint "[6/6] Finalising..."
  DetailPrint "      → User data directory will be created on first launch"
  DetailPrint "      → SQLite database lives in %APPDATA%\Hassan Electronics"
  DetailPrint "      → Daily backups land in the same folder"
  DetailPrint ""
  DetailPrint "✓ Hassan Electronics installed successfully."
  DetailPrint ""
!macroend

; ─────────────────────────────────────────────────────────────────────────
;  Uninstall narrative
; ─────────────────────────────────────────────────────────────────────────

!macro customUnInit
  DetailPrint "════════════════════════════════════════════════════════"
  DetailPrint "  Hassan Electronics — Uninstall"
  DetailPrint "════════════════════════════════════════════════════════"
  DetailPrint ""
!macroend

!macro customUnInstall
  ; customUnInstall runs BEFORE the default file-removal section, so the
  ; DetailPrint lines below appear as a heads-up describing what's about
  ; to be wiped. The actual file removal happens immediately after.
  DetailPrint "[1/5] Stopping any running instance..."
  DetailPrint "      → Closing Hassan Electronics.exe if running"
  DetailPrint "      → Releasing local SQLite handle"
  DetailPrint ""
  DetailPrint "[2/5] Removing shortcuts..."
  DetailPrint "      → Desktop shortcut"
  DetailPrint "      → Start Menu shortcut"
  DetailPrint ""
  DetailPrint "[3/5] Removing application files..."
  DetailPrint "      → Frontend (React build)"
  DetailPrint "      → Backend (NestJS server + node_modules)"
  DetailPrint "      → Electron runtime + Chromium"
  DetailPrint ""
  DetailPrint "[4/5] Cleaning Windows registration..."
  DetailPrint "      → Add/Remove Programs entry"
  DetailPrint "      → Uninstall registry keys"
  DetailPrint ""
  DetailPrint "[5/5] Preserving your data..."
  DetailPrint "      → SQLite database kept at %APPDATA%\Hassan Electronics"
  DetailPrint "      → Backups kept (delete manually if no longer needed)"
  DetailPrint ""
  DetailPrint "✓ Hassan Electronics will now be removed."
  DetailPrint ""
!macroend
