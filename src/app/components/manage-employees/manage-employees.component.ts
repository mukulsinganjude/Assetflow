import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { CustomSelectComponent } from '../shared/custom-select.component';
import { SelectOption } from '../../models/models';
import { MAX_IMPORT_ROWS, PageResult, exportXlsx, importFileLimitError, pageInfo, paginate } from '../../services/util';

/** A roster row enriched with the live count of assets currently held by the person. */
interface EmployeeRow { name: string; department: string; cciId: string; assetCount: number; }

/**
 * Admin panel for the employee roster (the people assets can be assigned to).
 * Add, rename (cascades to their assets on the server), change department, and
 * remove. Removal is blocked while a person still holds equipment. The roster is
 * the backend `employees` table; asset counts are derived live from DataService.
 */
@Component({
  selector: 'app-manage-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './manage-employees.component.html'
})
export class ManageEmployeesComponent implements OnInit {
  canAdd = () => this.auth.can('employeeDirectory.add');
  canEdit = () => this.auth.can('employeeDirectory.edit');
  canDelete = () => this.auth.can('employeeDirectory.delete');
  canImport = () => this.auth.can('employeeDirectory.import');
  canExport = () => this.auth.can('employeeDirectory.export');
  pageInfo = pageInfo;
  Infinity = Infinity;
  sizeOptions: SelectOption[] = [{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }, { value: '100', label: '100' }, { value: 'All', label: 'All' }];
  // Department is optional on the roster, so offer a "no department" choice.
  deptOptions: SelectOption[] = [{ value: '', label: 'No department' }, ...this.data.departments.map(d => ({ value: d, label: d }))];

  // add modal
  modalOpen = signal(false);
  newName = '';
  newDept = signal<string>('');
  newCciId = '';
  saving = signal(false);

  // edit modal
  editOpen = signal(false);
  editOriginalName = '';
  editName = '';
  editDept = signal<string>('');
  editCciId = '';
  editSaving = signal(false);

  // search + sort
  search = signal('');
  page = signal(1);
  size = signal<number>(10);
  sortField = signal<'name' | 'department' | 'cciId' | 'assetCount'>('name');
  sortAsc = signal(true);

  /** Roster joined with a live per-person asset count, filtered by search, sorted. */
  filteredRows = computed<EmployeeRow[]>(() => {
    const counts = new Map<string, number>();
    for (const a of this.data.assets()) {
      const who = (a.assignedTo || '').trim().toLowerCase();
      if (who && !['stock', 'unassigned'].includes(who.toLowerCase())) counts.set(who, (counts.get(who) || 0) + 1);
    }
    const q = this.search().trim().toLowerCase();
    const base = this.data.employeeRoster()
      .map(e => ({ name: e.name, department: e.department || '', cciId: e.cciId || '', assetCount: counts.get(e.name.toLowerCase()) || 0 }))
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q) || (`cci${r.cciId}`).toLowerCase().includes(q));
    const field = this.sortField();
    const asc = this.sortAsc();
    return base.sort((a, b) => {
      const cmp = field === 'assetCount'
        ? a.assetCount - b.assetCount
        : String(a[field] || '').toLowerCase().localeCompare(String(b[field] || '').toLowerCase());
      return asc ? cmp : -cmp;
    });
  });

  pageResult = computed<PageResult<EmployeeRow>>(() => paginate(this.filteredRows(), this.page(), this.size()));
  rows = computed<EmployeeRow[]>(() => this.pageResult().sliced);

  totalAssigned = computed(() => this.filteredRows().reduce((sum, r) => sum + r.assetCount, 0));

  constructor(public data: DataService, public auth: AuthService, private ui: UiService) {}

  ngOnInit() {
    this.data.loadEmployees();
    // Refresh assets too so the "assets held" counts are current on first view.
    if (this.data.assets().length === 0) this.data.loadAssets();
  }

  sort(field: 'name' | 'department' | 'cciId' | 'assetCount') {
    if (this.sortField() === field) this.sortAsc.set(!this.sortAsc());
    else { this.sortField.set(field); this.sortAsc.set(true); }
  }

  onSearch() { this.page.set(1); }
  changeSize(value: string) { this.size.set(value === 'All' ? Infinity : parseInt(value, 10)); this.page.set(1); }
  changePage(delta: number) { this.page.set(this.page() + delta); }

  openModal() {
    if (!this.canAdd()) return;
    this.newName = '';
    this.newDept.set('');
    this.newCciId = '';
    this.modalOpen.set(true);
  }
  closeModal() { this.modalOpen.set(false); }

  async addEmployee(event: Event) {
    event.preventDefault();
    if (!this.canAdd() || this.saving()) return;
    const name = this.newName.trim();
    if (!name) { this.ui.error('Enter the employee name.'); return; }
    if (['stock', 'unassigned'].includes(name.toLowerCase())) { this.ui.error('"Stock" is a reserved name.'); return; }
    if (this.data.employeeRoster().some(e => e.name.toLowerCase() === name.toLowerCase())) {
      this.ui.error(`An employee named "${name}" already exists.`); return;
    }
    this.saving.set(true);
    const res = await this.data.addEmployee(name, this.newDept(), this.normalizeCciId(this.newCciId));
    this.saving.set(false);
    if (!res.ok) { this.ui.error(res.error || 'Could not add the employee.'); return; }
    this.ui.success(`Employee "${name}" added.`);
    this.closeModal();
  }

  openEdit(row: EmployeeRow) {
    if (!this.canEdit()) return;
    this.editOriginalName = row.name;
    this.editName = row.name;
    this.editDept.set(row.department || '');
    this.editCciId = row.cciId;
    this.editOpen.set(true);
  }
  closeEdit() { this.editOpen.set(false); }

  async saveEdit() {
    if (!this.canEdit() || this.editSaving()) return;
    const name = this.editName.trim();
    if (!name) { this.ui.error('Employee name is required.'); return; }
    if (['stock', 'unassigned'].includes(name.toLowerCase())) { this.ui.error('"Stock" is a reserved name.'); return; }
    if (name.toLowerCase() !== this.editOriginalName.toLowerCase()
      && this.data.employeeRoster().some(e => e.name.toLowerCase() === name.toLowerCase())) {
      this.ui.error(`An employee named "${name}" already exists.`); return;
    }
    this.editSaving.set(true);
    const res = await this.data.updateEmployee(this.editOriginalName, { name, department: this.editDept(), cciId: this.normalizeCciId(this.editCciId) });
    this.editSaving.set(false);
    if (!res.ok) { this.ui.error(res.error || 'Could not update the employee.'); return; }
    this.ui.success(`Employee "${name}" updated.`);
    this.closeEdit();
  }

  async deleteEmployee(row: EmployeeRow) {
    if (!this.canDelete()) return;
    // The server also blocks this, but guard here for an instant, clearer message.
    if (row.assetCount > 0) {
      this.ui.error(`Cannot remove — ${row.assetCount} asset(s) are still assigned to ${row.name}. Reassign or check them in first.`);
      return;
    }
    const ok = await this.ui.confirm({ title: 'Remove employee', message: `Remove "${row.name}" from the roster? This cannot be undone.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    const res = await this.data.deleteEmployee(row.name);
    if (!res.ok) this.ui.error(res.error || 'Could not remove the employee.');
    else this.ui.success(`Employee "${row.name}" removed.`);
  }

  private normalizeCciId(value: string) { return value.trim().replace(/^CCI/i, '').trim(); }

  exportExcel() {
    if (!this.canExport()) return;
    const assetsByEmployee = new Map<string, number>();
    this.data.assets().forEach(asset => {
      const key = (asset.assignedTo || '').toLowerCase();
      if (key && !['stock', 'unassigned'].includes(key)) assetsByEmployee.set(key, (assetsByEmployee.get(key) || 0) + 1);
    });
    exportXlsx(this.filteredRows().map(row => ({ CCIID: row.cciId ? `CCI${row.cciId}` : '', Employee: row.name, Department: row.department || 'No department', 'Assets held': assetsByEmployee.get(row.name.toLowerCase()) || 0 })), 'Employees', 'AssetFlow_Employees.xlsx');
  }
  downloadTemplate() { exportXlsx([{ CCIID: 'CCI1043', Employee: 'Sarah Johnson', Department: 'IT' }], 'Employees Template', 'AssetFlow_Employees_Template.xlsx'); }
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
        if (!await this.ui.confirmImport(rows.length, 'employee')) return;
        const result = await this.data.importEmployees(rows);
        this.ui.success(`Imported ${result.imported} employee(s).`);
        if (result.skipped) this.ui.error(`Skipped ${result.skipped}:\\n- ${result.errors.slice(0, 8).join('\\n- ')}`, 8000);
      } catch { this.ui.error('Could not parse or import this file. Use the Employees template.'); }
      finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  }
}
