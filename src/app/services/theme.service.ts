import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorPreset =
  'default' | 'anthropic' | 'simple' | 'underground' | 'rose' |
  'lake' | 'sunset' | 'forest' | 'ocean' | 'lavender';
export type FontChoice = 'auto' | 'sans' | 'serif';
export type RadiusChoice = 'auto' | '0' | '0.3' | '0.5' | '0.75' | '1';
export type DensityChoice = 'compact' | 'default' | 'comfortable';
export type ShadowChoice = 'none' | 'soft' | 'default' | 'strong';
export type GlassChoice = 'flat' | 'subtle' | 'default' | 'vivid';
export type CursorChoice = 'custom' | 'system';

const KEYS = {
  mode: 'assetflow_mode',
  preset: 'assetflow_preset',
  font: 'assetflow_font',
  radius: 'assetflow_radius',
  density: 'assetflow_density',
  shadow: 'assetflow_shadow',
  glass: 'assetflow_glass',
  cursor: 'assetflow_cursor',
  legacy: 'assetflow_theme'
};

/**
 * Central appearance store. Persists each choice to localStorage and reflects
 * it onto <html> — the color mode via the `dark` class (unchanged contract for
 * the existing navbar switch) and everything else via `data-af-*` attributes
 * that styles.css keys off. `isDark()`/`toggle()` are kept for backwards
 * compatibility with the header light/dark switch.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal<boolean>(true);
  mode = signal<ThemeMode>('dark');
  preset = signal<ColorPreset>('default');
  font = signal<FontChoice>('auto');
  radius = signal<RadiusChoice>('auto');
  density = signal<DensityChoice>('default');
  shadow = signal<ShadowChoice>('default');
  glass = signal<GlassChoice>('default');
  cursor = signal<CursorChoice>('custom');

  private mql = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    const legacy = localStorage.getItem(KEYS.legacy);
    const savedMode = (localStorage.getItem(KEYS.mode) as ThemeMode)
      || (legacy === 'light' ? 'light' : 'dark');
    this.mode.set(savedMode);
    this.preset.set((localStorage.getItem(KEYS.preset) as ColorPreset) || 'default');
    this.font.set((localStorage.getItem(KEYS.font) as FontChoice) || 'auto');
    this.radius.set((localStorage.getItem(KEYS.radius) as RadiusChoice) || 'auto');
    this.density.set((localStorage.getItem(KEYS.density) as DensityChoice) || 'default');
    this.shadow.set((localStorage.getItem(KEYS.shadow) as ShadowChoice) || 'default');
    this.glass.set((localStorage.getItem(KEYS.glass) as GlassChoice) || 'default');
    this.cursor.set((localStorage.getItem(KEYS.cursor) as CursorChoice) || 'custom');

    // React to OS theme changes only while in "system" mode.
    this.mql.addEventListener('change', () => { if (this.mode() === 'system') this.applyMode(); });

    this.applyMode();
    this.applyAttributes();
  }

  private applyMode() {
    const dark = this.mode() === 'dark' || (this.mode() === 'system' && this.mql.matches);
    this.isDark.set(dark);
    document.documentElement.classList.toggle('dark', dark);
  }

  private applyAttributes() {
    const el = document.documentElement;
    el.setAttribute('data-af-preset', this.preset());
    el.setAttribute('data-af-font', this.font());
    el.setAttribute('data-af-radius', this.radius());
    el.setAttribute('data-af-density', this.density());
    el.setAttribute('data-af-shadow', this.shadow());
    el.setAttribute('data-af-glass', this.glass());
    el.setAttribute('data-af-cursor', this.cursor());
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
    localStorage.setItem(KEYS.mode, mode);
    localStorage.setItem(KEYS.legacy, this.mode() === 'light' ? 'light' : 'dark');
    this.applyMode();
  }

  setPreset(preset: ColorPreset) {
    this.preset.set(preset);
    localStorage.setItem(KEYS.preset, preset);
    this.applyAttributes();
  }

  setFont(font: FontChoice) {
    this.font.set(font);
    localStorage.setItem(KEYS.font, font);
    this.applyAttributes();
  }

  setRadius(radius: RadiusChoice) {
    this.radius.set(radius);
    localStorage.setItem(KEYS.radius, radius);
    this.applyAttributes();
  }

  setDensity(density: DensityChoice) {
    this.density.set(density);
    localStorage.setItem(KEYS.density, density);
    this.applyAttributes();
  }

  setShadow(shadow: ShadowChoice) {
    this.shadow.set(shadow);
    localStorage.setItem(KEYS.shadow, shadow);
    this.applyAttributes();
  }

  setGlass(glass: GlassChoice) {
    this.glass.set(glass);
    localStorage.setItem(KEYS.glass, glass);
    this.applyAttributes();
  }

  setCursor(cursor: CursorChoice) {
    this.cursor.set(cursor);
    localStorage.setItem(KEYS.cursor, cursor);
    this.applyAttributes();
  }

  /** Kept for the existing header light/dark toggle switch. */
  toggle() {
    this.setMode(this.isDark() ? 'light' : 'dark');
  }

  /** Restore all appearance settings to their defaults. */
  reset() {
    this.setMode('dark');
    this.setPreset('default');
    this.setFont('auto');
    this.setRadius('auto');
    this.setDensity('default');
    this.setShadow('default');
    this.setGlass('default');
    this.setCursor('custom');
  }
}
