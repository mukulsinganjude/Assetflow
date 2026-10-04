import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ThemeService, ColorPreset, FontChoice, RadiusChoice, DensityChoice, ShadowChoice, GlassChoice, CursorChoice
} from '../../services/theme.service';
import { UiService } from '../../services/ui.service';

interface PresetOption { id: ColorPreset; label: string; gradient: string; }

@Component({
  selector: 'app-theme-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './theme-settings.component.html'
})
export class ThemeSettingsComponent {
  presets: PresetOption[] = [
    { id: 'default', label: 'Default', gradient: 'linear-gradient(135deg,#6366f1,#a855f7,#ec4899)' },
    { id: 'anthropic', label: 'Anthropic', gradient: 'linear-gradient(135deg,#f5e4d8,#d97757)' },
    { id: 'simple', label: 'Simple B&W', gradient: 'linear-gradient(135deg,#f8fafc,#475569,#0f172a)' },
    { id: 'underground', label: 'Underground', gradient: 'linear-gradient(135deg,#6b7280,#4b5563,#78716c)' },
    { id: 'rose', label: 'Rose Garden', gradient: 'linear-gradient(135deg,#f43f5e,#fb7185)' },
    { id: 'lake', label: 'Lake View', gradient: 'linear-gradient(135deg,#10b981,#14b8a6)' },
    { id: 'sunset', label: 'Sunset Glow', gradient: 'linear-gradient(135deg,#f97316,#fb923c,#f43f5e)' },
    { id: 'forest', label: 'Forest Whisper', gradient: 'linear-gradient(135deg,#0d9488,#15803d)' },
    { id: 'ocean', label: 'Ocean Breeze', gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)' },
    { id: 'lavender', label: 'Lavender Dream', gradient: 'linear-gradient(135deg,#a78bfa,#c084fc,#f0abfc)' }
  ];

  fonts: { id: FontChoice; label: string; family: string }[] = [
    { id: 'auto', label: 'Auto', family: "'Plus Jakarta Sans', sans-serif" },
    { id: 'sans', label: 'Sans', family: "'Plus Jakarta Sans', sans-serif" },
    { id: 'serif', label: 'Serif', family: "Georgia, 'Times New Roman', serif" }
  ];

  radii: { id: RadiusChoice; label: string; px: string }[] = [
    { id: 'auto', label: 'Auto', px: '12px' },
    { id: '0', label: '0', px: '0px' },
    { id: '0.3', label: '0.3', px: '6px' },
    { id: '0.5', label: '0.5', px: '10px' },
    { id: '0.75', label: '0.75', px: '15px' },
    { id: '1', label: '1.0', px: '20px' }
  ];

  densities: { id: DensityChoice; label: string; lines: number[] }[] = [
    { id: 'compact', label: 'Compact', lines: [70, 90, 60, 80] },
    { id: 'default', label: 'Default', lines: [70, 90, 60] },
    { id: 'comfortable', label: 'Comfortable', lines: [70, 90] }
  ];

  shadows: { id: ShadowChoice; label: string; preview: string }[] = [
    { id: 'none', label: 'None', preview: 'none' },
    { id: 'soft', label: 'Soft', preview: '0 4px 10px rgba(15,23,42,.18)' },
    { id: 'default', label: 'Default', preview: '0 10px 20px rgba(15,23,42,.28)' },
    { id: 'strong', label: 'Strong', preview: '0 16px 30px rgba(15,23,42,.42)' }
  ];

  glasses: { id: GlassChoice; label: string; preview: string }[] = [
    { id: 'flat', label: 'Flat', preview: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)' },
    { id: 'subtle', label: 'Subtle', preview: 'linear-gradient(135deg,rgba(226,232,240,.85),rgba(203,213,225,.6))' },
    { id: 'default', label: 'Default', preview: 'linear-gradient(135deg,rgba(226,232,240,.7),rgba(203,213,225,.45))' },
    { id: 'vivid', label: 'Vivid', preview: 'linear-gradient(135deg,rgba(255,255,255,.55),rgba(203,213,225,.3))' }
  ];

  cursors: { id: CursorChoice; label: string; icon: string; hint: string }[] = [
    { id: 'custom', label: 'Custom', icon: 'fa-location-arrow', hint: 'Styled AssetFlow pointer' },
    { id: 'system', label: 'System', icon: 'fa-arrow-pointer', hint: 'Your native OS cursor' }
  ];

  constructor(public theme: ThemeService, public ui: UiService) {}

  close() { this.ui.closeThemeSettings(); }
}
