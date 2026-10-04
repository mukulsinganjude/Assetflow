import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { CustomSelectComponent } from '../shared/custom-select.component';
import { AuditLog, SelectOption } from '../../models/models';
import { PageResult, exportXlsx, pageInfo, paginate } from '../../services/util';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './logs.component.html'
})
export class LogsComponent implements OnInit {
  pageInfo = pageInfo;
  Infinity = Infinity;
  sizeOptions: SelectOption[] = [{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }, { value: '100', label: '100' }];

  search = signal('');
  userFilter = signal('All');
  actionFilter = signal('All');
  actionOptions: SelectOption[] = [
    { value: 'All', label: 'All actions' }, { value: 'Assets', label: 'Assets' },
    { value: 'Employees', label: 'Employees and returns' }, { value: 'Users', label: 'User access' },
    { value: 'Cases', label: 'Dell cases' }, { value: 'Desk setup', label: 'Desk setup' },
    { value: 'Consumables', label: 'Consumables' }, { value: 'Links', label: 'Shared links' },
    { value: 'Warranty', label: 'Warranty' }, { value: 'Other', label: 'Other' }
  ];
  fromDate = signal('');
  toDate = signal('');
  sortField = signal('timestamp');
  // Put the latest activity on the first page by default.
  sortAsc = signal(false);
  page = signal(1);
  size = signal<number>(10);

  /** Distinct users seen in the log, for the user dropdown. */
  userOptions = computed<SelectOption[]>(() => {
    const users = [...new Set(this.data.auditLogs().map(l => l.user))].filter(u => !!u).sort((a, b) => a.localeCompare(b));
    return [{ value: 'All', label: 'All users' }, ...users.map(u => ({ value: u, label: u }))];
  });

  hasFilters = computed(() =>
    !!this.search().trim() || this.userFilter() !== 'All' || this.actionFilter() !== 'All' || !!this.fromDate() || !!this.toDate());
  dateRangeInvalid = computed(() => !!this.fromDate() && !!this.toDate() && this.fromDate() > this.toDate());

  private actionGroup(action: string): string {
    const value = action.toLowerCase();
    if (/dell case/.test(value)) return 'Cases';
    if (/consumable|stock adjustment/.test(value)) return 'Consumables';
    if (/desk setup|desk item/.test(value)) return 'Desk setup';
    if (/user account|user role|password|user profile/.test(value)) return 'Users';
    if (/employee|offboarding|returned to storage|checklist/.test(value)) return 'Employees';
    if (/shared link|quick link/.test(value)) return 'Links';
    if (/warranty/.test(value)) return 'Warranty';
    if (/asset|item|checked in|checked out|assignment|status/.test(value)) return 'Assets';
    return 'Other';
  }

  /** Parse ISO timestamps and legacy locale strings from older installs. */
  private parseLogTimestamp(ts: string): Date | null {
    if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) {
      const parsed = new Date(ts);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const legacy = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?)?$/i);
    if (!legacy) {
      const parsed = new Date(ts);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const first = Number(legacy[1]);
    const second = Number(legacy[2]);
    // Resolve unambiguous legacy formats directly. Ambiguous values use day-first,
    // matching the app's original Asia/Calcutta host locale.
    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    let hour = Number(legacy[4] || 0);
    const meridiem = (legacy[7] || '').toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    const parsed = new Date(Number(legacy[3]), month - 1, day, hour, Number(legacy[5] || 0), Number(legacy[6] || 0));
    return parsed.getFullYear() === Number(legacy[3]) && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
  }

  formatTimestamp(ts: string): string {
    return this.parseLogTimestamp(ts)?.toLocaleString() || ts;
  }

  /** Parse a timestamp to local YYYY-MM-DD for comparison with date inputs. */
  private logDateKey(ts: string): string {
    const d = this.parseLogTimestamp(ts);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private filtered = computed<AuditLog[]>(() => {
    const q = this.search().toLowerCase().trim();
    const uf = this.userFilter();
    const action = this.actionFilter();
    const from = this.fromDate();
    const to = this.toDate();
    if (this.dateRangeInvalid()) return [];
    return this.data.auditLogs().filter(log => {
      const matchesQuery = !q || log.user.toLowerCase().includes(q) || log.action.toLowerCase().includes(q) || log.timestamp.toLowerCase().includes(q);
      const matchesUser = uf === 'All' || log.user === uf;
      const matchesAction = action === 'All' || this.actionGroup(log.action) === action;
      let matchesDate = true;
      if (from || to) {
        const key = this.logDateKey(log.timestamp);
        if (key) {
          if (from && key < from) matchesDate = false;
          if (to && key > to) matchesDate = false;
        }
      }
      return matchesQuery && matchesUser && matchesAction && matchesDate;
    });
  });

  private sorted = computed<AuditLog[]>(() => {
    const field = this.sortField();
    const asc = this.sortAsc();
    return [...this.filtered()].sort((a, b) => {
      // Timestamps are stored as locale strings, so a plain string compare is
      // not chronological (e.g. "9/9/2025" > "10/1/2025"). Compare as dates,
      // falling back to string order when a value can't be parsed.
      if (field === 'timestamp') {
        const ta = this.parseLogTimestamp(a.timestamp)?.getTime();
        const tb = this.parseLogTimestamp(b.timestamp)?.getTime();
        if (ta !== undefined && tb !== undefined) return asc ? ta - tb : tb - ta;
        if (ta !== undefined) return asc ? -1 : 1;
        if (tb !== undefined) return asc ? 1 : -1;
      }
      const valA = ((a as any)[field] || '').toLowerCase();
      const valB = ((b as any)[field] || '').toLowerCase();
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  });

  pageResult = computed<PageResult<AuditLog>>(() => paginate(this.sorted(), this.page(), this.size()));

  constructor(public data: DataService, public auth: AuthService, private ui: UiService) {}

  ngOnInit() { void this.refresh(); }

  async refresh() {
    const ok = await this.data.loadLogs();
    if (ok) this.page.set(1);
  }

  sort(field: string) {
    if (this.sortField() === field) this.sortAsc.set(!this.sortAsc());
    else { this.sortField.set(field); this.sortAsc.set(true); }
  }
  onSearch() { this.page.set(1); }
  onFilter() { this.page.set(1); }
  clearFilters() {
    this.search.set('');
    this.userFilter.set('All');
    this.actionFilter.set('All');
    this.fromDate.set('');
    this.toDate.set('');
    this.page.set(1);
  }
  changeSize(v: string) { this.size.set(v === 'All' ? Infinity : parseInt(v, 10)); this.page.set(1); }
  changePage(delta: number) { this.page.set(this.page() + delta); }

  async clearLogs() {
    if (!this.auth.can('activity.clear')) return;
    const ok = await this.ui.confirm({ title: 'Clear audit logs', message: 'Permanently clear all audit logs? This cannot be undone.', confirmLabel: 'Clear logs', danger: true });
    if (ok) {
      try {
        await this.data.clearLogs();
        this.ui.success('Audit logs cleared.');
      } catch (e) {
        this.ui.error(e instanceof Error ? e.message : 'Could not clear audit logs.');
      }
    }
  }
  exportExcel() { if (!this.auth.can('activity.export')) return; exportXlsx(this.sorted(), 'Logs', 'AssetFlow_Audit_Logs.xlsx'); }
}
