import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';
import { QuickLink } from '../../models/models';
import { MAX_IMPORT_ROWS, exportXlsx, importFileLimitError } from '../../services/util';

@Component({ selector: 'app-links', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './links.component.html' })
export class LinksComponent implements OnInit {
  addOpen = signal(false);
  saving = signal(false);
  error = signal('');
  search = signal('');
  name = '';
  url = '';
  purpose = '';
  canAdd = () => this.auth.can('links.add');
  canImport = () => this.auth.can('links.import');
  canExport = () => this.auth.can('links.export');
  filteredLinks = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.data.quickLinks().filter(link => !query || `${link.name} ${link.purpose || ''} ${link.createdBy}`.toLowerCase().includes(query));
  });

  constructor(public data: DataService, private auth: AuthService, private ui: UiService) {}
  ngOnInit() { this.data.loadQuickLinks(); }

  openAdd() { if (!this.canAdd()) return; this.name = ''; this.url = ''; this.purpose = ''; this.error.set(''); this.addOpen.set(true); }
  onSearch(value: string) { this.search.set(value); }
  linkHref(rawUrl: string): string {
    let candidate = String(rawUrl || '').trim();
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const parsed = new URL(candidate);
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname ? parsed.toString() : '#';
    } catch { return '#'; }
  }
  downloadTemplate() { exportXlsx([{ Name: 'IT Help Desk', Purpose: 'Optional description', URL: 'https://example.com' }], 'Shared Links Template', 'AssetFlow_Shared_Links_Template.xlsx'); }
  exportExcel() { if (!this.canExport()) return; exportXlsx(this.filteredLinks().map(link => ({ Name: link.name, Purpose: link.purpose || '', URL: link.url, 'Added By': link.createdBy, 'Added On': link.createdAt })), 'Shared Links', 'AssetFlow_Shared_Links.xlsx'); }
  importExcel(event: Event) {
    if (!this.canImport()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const limitError = importFileLimitError(file);
    if (limitError) { this.ui.error(limitError); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const workbook = XLSX.read(new Uint8Array((e.target as FileReader).result as ArrayBuffer), { type: 'array', sheetRows: MAX_IMPORT_ROWS + 2 });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        if (rows.length > MAX_IMPORT_ROWS) { this.ui.error(`This spreadsheet has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files and try again.`); return; }
        if (!await this.ui.confirmImport(rows.length, 'shared link')) return;
        const result = await this.data.importQuickLinks(rows);
        this.ui.success(`Imported ${result.imported} link(s).`);
        if (result.skipped) this.ui.error(`Skipped ${result.skipped}:\\n- ${result.errors.slice(0, 8).join('\\n- ')}`, 8000);
      } catch { this.ui.error('Could not parse or import this file. Use the Shared Links template.'); }
      finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  }
  closeAdd() { if (this.saving()) return; this.addOpen.set(false); this.error.set(''); }
  async save(event: Event) {
    event.preventDefault();
    if (!this.canAdd() || this.saving()) return;
    this.saving.set(true); this.error.set('');
    const payload = { name: this.name.trim(), url: this.url.trim(), purpose: this.purpose.trim() };
    const result = await this.data.addQuickLink(payload);
    this.saving.set(false);
    if (!result.ok) { this.error.set(result.error || 'Could not add the link.'); return; }
    this.addOpen.set(false); this.ui.success('Shared link added.');
  }
  canDelete(link: QuickLink) { return this.auth.can('links.delete') && (this.auth.isAdmin() || link.createdBy === this.auth.currentUser()?.username); }
  date(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(); }
  async remove(link: QuickLink) {
    if (!this.canDelete(link)) return;
    const ok = await this.ui.confirm({ title: 'Remove link', message: `Remove "${link.name}" from shared links?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    const result = await this.data.deleteQuickLink(link.id);
    if (!result.ok) this.ui.error(result.error || 'Could not remove the link.');
    else this.ui.success('Link removed.');
  }
}
