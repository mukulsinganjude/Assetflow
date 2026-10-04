import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { CustomSelectComponent } from '../shared/custom-select.component';
import { Asset, SelectOption } from '../../models/models';
import { MAX_IMPORT_ROWS, PageResult, categoryIcon, exportXlsx, importFileLimitError, pageInfo, paginate } from '../../services/util';

@Component({
  selector: 'app-warranty',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './warranty.component.html'
})
export class WarrantyComponent {
  categoryIcon = categoryIcon;
  pageInfo = pageInfo;
  Infinity = Infinity;

  statusOptions: SelectOption[] = [{ value: 'All', label: 'All Statuses' }, { value: 'Active', label: 'Active' }, { value: 'Expiring', label: 'Expiring ≤90d' }, { value: 'Expired', label: 'Expired' }];
  sizeOptions: SelectOption[] = [{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }, { value: '100', label: '100' }, { value: 'All', label: 'All' }];

  search = signal('');
  statusFilter = signal('All');
  sortField = signal('name');
  sortAsc = signal(true);
  page = signal(1);
  size = signal<number>(10);
  selected = signal<Set<number>>(new Set());

  forecast = computed(() => {
    const today = new Date();
    let urgent = 0, mid = 0, healthy = 0;
    for (const item of this.data.assets()) {
      if (item.warrantyDate) {
        const wDate = new Date(item.warrantyDate);
        const diffDays = Math.ceil((wDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 365) urgent++;
        else if (diffDays <= 1095) mid++;
        else healthy++;
      } else healthy++;
    }
    return { urgent, mid, healthy };
  });

  /** Days until warranty expiry (negative = already expired); null if no/invalid date. */
  daysUntil(item: Asset): number | null {
    if (!item.warrantyDate) return null;
    const t = new Date(item.warrantyDate).getTime();
    if (isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
  }

  /** True for an in-warranty asset expiring within the next 90 days. */
  expiringSoonItem(item: Asset): boolean {
    const d = this.daysUntil(item);
    return d !== null && d >= 0 && d <= 90;
  }

  /** Counts for the 30/60/90-day expiry alert banner (mutually exclusive buckets). */
  expiryAlerts = computed(() => {
    let d30 = 0, d60 = 0, d90 = 0, expired = 0;
    for (const item of this.data.assets()) {
      const d = this.daysUntil(item);
      if (d === null) continue;
      if (d < 0) expired++;
      else if (d <= 30) d30++;
      else if (d <= 60) d60++;
      else if (d <= 90) d90++;
    }
    return { d30, d60, d90, expired, total: d30 + d60 + d90 };
  });

  /** Soonest-expiring assets (≤90 days out, soonest first) for the alert list. */
  expiringSoon = computed<Asset[]>(() =>
    this.data.assets()
      .filter(a => this.expiringSoonItem(a))
      .sort((a, b) => (this.daysUntil(a)! - this.daysUntil(b)!))
  );

  /** Focus the table on items expiring within 90 days. */
  reviewExpiring() { this.statusFilter.set('Expiring'); this.page.set(1); }


  private filtered = computed<Asset[]>(() => {
    const q = this.search().toLowerCase();
    const sf = this.statusFilter();
    const today = new Date();
    return this.data.assets().filter(item => {
      const matchesQuery = item.name.toLowerCase().includes(q) || item.serial.toLowerCase().includes(q) || (item.assignedTo && item.assignedTo.toLowerCase().includes(q));
      const isExpired = !!item.warrantyDate && new Date(item.warrantyDate) < today;
      let matchesStatus: boolean;
      if (sf === 'All') matchesStatus = true;
      else if (sf === 'Expiring') matchesStatus = this.expiringSoonItem(item);
      else matchesStatus = (isExpired ? 'Expired' : 'Active') === sf;
      return matchesQuery && matchesStatus;
    });
  });

  private sorted = computed<Asset[]>(() => {
    const field = this.sortField();
    const asc = this.sortAsc();
    // "Warranty Status" is derived (Active/Expired) rather than a real field,
    // so sort it by expiry state, tie-breaking on the warranty date.
    if (field === 'warrantyStatus') {
      const today = new Date();
      return [...this.filtered()].sort((a, b) => {
        const ea = a.warrantyDate && new Date(a.warrantyDate) < today ? 1 : 0;
        const eb = b.warrantyDate && new Date(b.warrantyDate) < today ? 1 : 0;
        const cmp = ea !== eb ? ea - eb : (a.warrantyDate || '').localeCompare(b.warrantyDate || '');
        return asc ? cmp : -cmp;
      });
    }
    return [...this.filtered()].sort((a, b) => {
      const valA = ((a as any)[field] || '').toString().toLowerCase();
      const valB = ((b as any)[field] || '').toString().toLowerCase();
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  });

  pageResult = computed<PageResult<Asset>>(() => paginate(this.sorted(), this.page(), this.size()));

  constructor(public data: DataService, public auth: AuthService, private ui: UiService) {}

  isExpired(item: Asset) { return !!item.warrantyDate && new Date(item.warrantyDate) < new Date(); }

  sort(field: string) {
    if (this.sortField() === field) this.sortAsc.set(!this.sortAsc());
    else { this.sortField.set(field); this.sortAsc.set(true); }
  }
  onSearch() { this.page.set(1); this.selected.set(new Set()); }
  onFilter() { this.page.set(1); this.selected.set(new Set()); }
  changeSize(v: string) { this.size.set(v === 'All' ? Infinity : parseInt(v, 10)); this.page.set(1); }
  changePage(delta: number) { this.page.set(this.page() + delta); }

  get canSelect() { return this.auth.can('warranty.edit'); }
  isSelected(id: number) { return this.selected().has(id); }
  toggleRow(id: number, checked: boolean) {
    const next = new Set(this.selected());
    if (checked) next.add(id); else next.delete(id);
    this.selected.set(next);
  }
  toggleAll(checked: boolean) {
    const next = new Set(this.selected());
    for (const item of this.pageResult().sliced) { if (checked) next.add(item.id); else next.delete(item.id); }
    this.selected.set(next);
  }
  async bulkExtend() {
    if (!this.auth.can('warranty.edit')) return;
    if (this.selected().size === 0) { this.ui.error('Select at least one item.'); return; }
    const ok = await this.ui.confirm({ title: 'Extend warranty dates', message: `Move the warranty end date forward by one year for ${this.selected().size} selected asset(s)?`, confirmLabel: 'Extend by one year' });
    if (!ok) return;
    const count = await this.data.extendWarranty(this.selected());
    this.selected.set(new Set());
    this.ui.success(`Extended warranty for ${count} item(s).`);
  }
  exportExcel() {
    if (!this.auth.can('warranty.export')) return;
    // Export the current filtered/sorted view (matches the Entry export), and
    // guard against an empty export producing a blank file.
    const src = this.sorted();
    if (src.length === 0) { this.ui.error('No assets to export.'); return; }
    const data = src.map(a => ({
      'Item Name': a.name,
      'Category': a.category,
      'Serial Number': a.serial,
      'Assigned To': a.assignedTo,
      'Purchase Date': a.purchaseDate || '',
      'Warranty Date': a.warrantyDate || '',
      'Warranty Status': this.isExpired(a) ? 'Expired' : 'Active'
    }));
    exportXlsx(data, 'Warranty', 'AssetFlow_Warranty_Report.xlsx');
  }

  get canImport() { return this.auth.can('warranty.import'); }
  get canExport() { return this.auth.can('warranty.export'); }

  /** Download a blank warranty sheet (Serial + dates) to fill in and re-import. */
  downloadTemplate() {
    const sample = [{ 'Serial Number': 'SN-001', 'Purchase Date': '2024-01-01', 'Warranty Date': '2027-01-01' }];
    exportXlsx(sample, 'Template', 'AssetFlow_Warranty_Template.xlsx');
  }

  /** Import warranty dates from an Excel/CSV file; matches existing assets by serial. */
  importWarranty(event: Event) {
    if (!this.canImport) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const limitError = importFileLimitError(file);
    if (limitError) { this.ui.error(limitError); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataArr = new Uint8Array((e.target as FileReader).result as ArrayBuffer);
        const workbook = XLSX.read(dataArr, { type: 'array', sheetRows: MAX_IMPORT_ROWS + 2 });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        if (rows.length > MAX_IMPORT_ROWS) { this.ui.error(`This spreadsheet has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files and try again.`); return; }
        if (!await this.ui.confirmImport(rows.length, 'warranty')) return;
        const res = await this.data.importWarranty(rows as any[]);
        this.ui.success(`Updated warranty for ${res.updated} asset(s).`);
        if (res.skipped) this.ui.error(`Skipped ${res.skipped}:\n- ${res.errors.slice(0, 8).join('\n- ')}`, 8000);
      } catch {
        this.ui.error('Error parsing or importing the file.');
      } finally {
        input.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }
}
