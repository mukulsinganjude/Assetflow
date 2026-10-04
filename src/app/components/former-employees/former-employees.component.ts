import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { FormerEmployeeRecord, SelectOption } from '../../models/models';
import { PageResult, exportXlsx, pageInfo, paginate } from '../../services/util';
import { CustomSelectComponent } from '../shared/custom-select.component';

@Component({
  selector: 'app-former-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './former-employees.component.html'
})
export class FormerEmployeesComponent implements OnInit {
  pageInfo = pageInfo;
  Infinity = Infinity;
  sizeOptions: SelectOption[] = [{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }];
  search = signal('');
  page = signal(1);
  size = signal<number>(10);
  sortField = signal<'cciId' | 'name' | 'department' | 'assets'>('name');
  sortAsc = signal(true);
  private sortedRows = computed(() => {
    const query = this.search().trim().toLowerCase();
    const field = this.sortField();
    const direction = this.sortAsc() ? 1 : -1;
    return this.data.formerEmployees().filter(row => !query || `${row.name} ${row.cciId || ''} ${row.department} ${row.assets.map(a => `${a.name} ${a.serial}`).join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const left = field === 'assets' ? a.assets.length : String(a[field] || '').toLowerCase();
        const right = field === 'assets' ? b.assets.length : String(b[field] || '').toLowerCase();
        const compare = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
        return compare * direction;
      });
  });
  pageResult = computed<PageResult<FormerEmployeeRecord>>(() => paginate(this.sortedRows(), this.page(), this.size()));
  ngOnInit() { this.data.loadFormerEmployees(); }
  constructor(public data: DataService, public auth: AuthService, private ui: UiService) {}
  filtered() { return this.pageResult().sliced; }
  onSearch(value: string) { this.search.set(value); this.page.set(1); }
  sort(field: 'cciId' | 'name' | 'department' | 'assets') { if (this.sortField() === field) this.sortAsc.set(!this.sortAsc()); else { this.sortField.set(field); this.sortAsc.set(true); } }
  changeSize(value: string) { this.size.set(value === 'All' ? Infinity : parseInt(value, 10)); this.page.set(1); }
  changePage(delta: number) { this.page.set(this.page() + delta); }
  exportExcel() {
    if (!this.auth.can('formerEmployees.export')) return;
    const rows = this.sortedRows().flatMap(employee => employee.assets.length
      ? employee.assets.map(asset => ({
          CCIID: employee.cciId ? `CCI${employee.cciId}` : '',
          Employee: employee.name,
          Department: employee.department || 'No department',
          'Left Company': employee.leftAt,
          'Archived By': employee.archivedBy,
          'Asset Name': asset.name,
          Category: asset.category,
          Serial: asset.serial,
          'Assignment Type': asset.assignmentType || '',
          'Status at Departure': asset.status || '',
          'Condition on Return': asset.offboardingCondition || 'Not recorded',
          'Purchase Date': asset.purchaseDate || '',
          'Warranty Date': asset.warrantyDate || ''
        }))
      : [{ CCIID: employee.cciId ? `CCI${employee.cciId}` : '', Employee: employee.name, Department: employee.department || 'No department', 'Left Company': employee.leftAt, 'Archived By': employee.archivedBy, 'Asset Name': '', Category: '', Serial: '', 'Assignment Type': '', 'Status at Departure': '', 'Condition on Return': 'No assets recorded', 'Purchase Date': '', 'Warranty Date': '' }]);
    if (!rows.length) { this.ui.error('No former employee records to export.'); return; }
    exportXlsx(rows, 'Former Employees', 'AssetFlow_Former_Employees.xlsx');
  }
  openAssetInfo(record: FormerEmployeeRecord) { this.ui.showFormerEmployeeAssetDetails(record); }
  formatDate(value: string) { return new Date(value).toLocaleDateString(); }
}
