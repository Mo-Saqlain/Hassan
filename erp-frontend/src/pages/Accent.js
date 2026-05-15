import { useEffect, useState } from 'react';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  applyAccent,
  clearAppliedAccent,
  getOsAccent,
  getStoredAccent,
  setStoredAccent,
  subscribeOsAccentChange,
} from '../theme/accent';

/**
 * System → Accent tab. Two modes:
 *   • "Follow Windows accent" — clears the stored override so the OS accent
 *     pushed by Electron (and re-pushed on `accent-color-changed`) wins.
 *   • "Use custom accent"     — writes a per-device override into
 *     `localStorage` under `hassan-accent-color`; takes precedence over
 *     the OS accent in [erp-frontend/src/theme/accent.js].
 */
export default function Accent() {
  const [stored, setStored] = useState(getStoredAccent());
  const [osAccent, setOsAccent] = useState(getOsAccent());
  const [flash, setFlash] = useState(null);

  const mode = stored ? 'custom' : osAccent ? 'os' : 'custom';

  // Subscribe to live OS-accent changes pushed by the Electron main
  // process (the user opens Windows Personalisation mid-session and
  // picks a new colour). If the user is on "Follow Windows" mode, the
  // new accent also re-applies immediately so they see it without
  // restarting the app.
  useEffect(() => {
    const unsub = subscribeOsAccentChange((hex) => {
      if (!hex) return;
      setOsAccent(hex);
      if (!getStoredAccent()) applyAccent(hex);
    });
    return unsub;
  }, []);

  const flashOk = (msg) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  };

  const chooseOsMode = () => {
    if (!osAccent) return;
    setStoredAccent(null);
    clearAppliedAccent();
    applyAccent(osAccent);
    setStored(null);
    flashOk('Now following the Windows accent colour.');
  };

  const chooseCustomMode = () => {
    if (stored) return;
    const seed = osAccent || DEFAULT_ACCENT;
    applyAccent(seed);
    setStoredAccent(seed);
    setStored(seed);
    flashOk('Switched to a custom accent. Pick any colour below.');
  };

  const applyCustom = (hex) => {
    if (!applyAccent(hex)) return;
    setStoredAccent(hex);
    setStored(hex.toLowerCase());
    flashOk('Accent colour updated.');
  };

  const currentSwatch = stored || osAccent || DEFAULT_ACCENT;

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Accent colour</h2>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          The accent colour is used for primary buttons, active tabs,
          focus rings, the Adjusted Net Income row on the Income
          Statement, and the active sidebar strip. Saved on this device
          only.
        </p>

        <label style={{ marginTop: 8 }}>Accent source</label>
        <div
          role="radiogroup"
          aria-label="Accent source"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <ModeCard
            label="Follow Windows accent"
            description={
              osAccent
                ? `Auto-syncs with Windows Personalisation. Currently ${osAccent}.`
                : 'Available only inside the desktop app on Windows or macOS.'
            }
            swatch={osAccent || '#cccccc'}
            selected={mode === 'os'}
            disabled={!osAccent}
            onClick={chooseOsMode}
          />
          <ModeCard
            label="Use custom accent"
            description="Pick a preset or type any hex value below."
            swatch={mode === 'custom' ? currentSwatch : (stored || DEFAULT_ACCENT)}
            selected={mode === 'custom'}
            disabled={false}
            onClick={chooseCustomMode}
          />
        </div>

        {mode === 'custom' && (
          <>
            <label style={{ marginTop: 4 }}>Presets</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => applyCustom(p.value)}
                  title={`${p.name} — ${p.value}`}
                  aria-label={p.name}
                  style={{
                    width: 36,
                    height: 36,
                    padding: 0,
                    background: p.value,
                    border:
                      stored === p.value.toLowerCase()
                        ? '2px solid var(--text)'
                        : '1px solid var(--border-strong)',
                    borderRadius: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>

            <div
              className="form-row"
              style={{ marginBottom: 0, alignItems: 'flex-end' }}
            >
              <div>
                <label>Custom colour</label>
                <input
                  type="color"
                  value={stored || DEFAULT_ACCENT}
                  onChange={(e) => applyCustom(e.target.value)}
                  style={{ width: 80, height: 32, padding: 0 }}
                />
              </div>
              <div>
                <label>Hex value</label>
                <input
                  type="text"
                  value={stored || DEFAULT_ACCENT}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyCustom(v);
                  }}
                  placeholder="#0078d4"
                  style={{ width: 110, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
          </>
        )}

        {flash && (
          <div className="alert alert-success" style={{ marginTop: 12 }}>
            {flash}
          </div>
        )}

        <div
          className="muted"
          style={{
            fontSize: 12,
            marginTop: 14,
            borderTop: '1px solid var(--border)',
            paddingTop: 10,
          }}
        >
          <div>
            <strong>Current source:</strong>{' '}
            {mode === 'custom'
              ? `Custom (${stored})`
              : osAccent
                ? `Windows accent (${osAccent})`
                : `Default (${DEFAULT_ACCENT})`}
          </div>
          {mode === 'os' && osAccent && (
            <div style={{ marginTop: 4 }}>
              When you change your Windows Personalisation colour the app
              picks it up automatically.
            </div>
          )}
          {!osAccent && (
            <div style={{ marginTop: 4 }}>
              Open this app through the Electron desktop wrapper on
              Windows or macOS to enable "Follow Windows accent".
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ModeCard({ label, description, swatch, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        padding: '12px 14px',
        background: selected ? 'var(--primary-soft)' : 'var(--surface-elev)',
        border: selected
          ? '2px solid var(--primary)'
          : '1px solid var(--border-strong)',
        borderRadius: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          background: swatch,
          border: '1px solid var(--border-strong)',
          flex: '0 0 auto',
        }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {description}
        </span>
      </span>
    </button>
  );
}
