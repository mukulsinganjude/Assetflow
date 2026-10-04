import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { AccessoryChecklist, AssetCondition, Employee, OffboardingChecklist, OffboardingChecklistItem, SelectOption } from '../../models/models';
import { CustomSelectComponent } from '../shared/custom-select.component';

@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './returns.component.html'
})
export class ReturnsComponent {
  search = signal('');
  selectedEmployees = signal<string[]>([]);
  openedChecklistEmployee = signal('');
  busyItem = signal<number | null>(null);
  error = signal('');
  accessoriesByAsset = signal<Record<number, AccessoryChecklist>>({});
  conditionByAsset = signal<Record<number, AssetCondition>>({});
  readonly conditionOptions: SelectOption[] = [
    { value: 'Good', label: 'Good' },
    { value: 'Damaged', label: 'Damaged' },
    { value: 'Needs repair', label: 'Needs repair' }
  ];
  readonly accessoryFields: { key: keyof AccessoryChecklist; label: string }[] = [
    { key: 'charger', label: 'Charger' }, { key: 'mouse', label: 'Mouse' },
    { key: 'dockingStation', label: 'Dock' }, { key: 'bag', label: 'Bag' }, { key: 'adapter', label: 'Adapter' }
  ];

  employeeOptions = computed<Employee[]>(() => {
    const roster = this.data.employeeRoster();
    const byName = new Map<string, Employee>();
    for (const employee of roster) {
      const name = employee.name.trim();
      if (name) byName.set(name.toLowerCase(), { ...employee, name });
    }
    const otherNames = [...this.data.employees(), ...this.data.offboardingChecklists().map(checklist => checklist.employeeName)];
    for (const rawName of otherNames) {
      const name = rawName.trim();
      if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name, department: '' });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  matchedEmployees = computed<Employee[]>(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return [];
    return this.employeeOptions().filter(employee =>
      employee.name.toLowerCase().includes(query) || String(employee.cciId || '').toLowerCase().includes(query)
    );
  });
  showEmployeeOptions = computed(() => this.search().trim().length > 0);

  constructor(public data: DataService, public auth: AuthService, private ui: UiService) { void data.loadOffboardingChecklists(); }

  isSelected(name: string): boolean { return this.selectedEmployees().some(selected => selected.toLowerCase() === name.toLowerCase()); }
  employeeCciIdLabel(name: string): string {
    const id = this.employeeOptions().find(employee => employee.name.toLowerCase() === name.toLowerCase())?.cciId;
    return id ? `CCI${id}` : 'CCIID not set';
  }
  toggleEmployee(name: string) {
    this.error.set('');
    this.selectedEmployees.update(current => this.isSelected(name)
      ? current.filter(selected => selected.toLowerCase() !== name.toLowerCase())
      : [...current, name]);
  }
  removeEmployee(name: string) { this.selectedEmployees.update(current => current.filter(selected => selected.toLowerCase() !== name.toLowerCase())); }

  checklistsFor(name: string): OffboardingChecklist[] {
    return this.data.offboardingChecklists().filter(checklist => checklist.employeeName.toLowerCase() === name.toLowerCase())
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  checklistFor(name: string): OffboardingChecklist | null { return this.checklistsFor(name)[0] || null; }
  activeChecklistFor(name: string): OffboardingChecklist | null { return this.checklistsFor(name).find(checklist => !checklist.completedAt) || null; }
  assignedCountFor(name: string): number { return this.data.assets().filter(asset => asset.assignedTo.toLowerCase() === name.toLowerCase()).length; }
  returnedCount(checklist: OffboardingChecklist | null): number { return checklist?.items.filter(item => !!item.returnedAt).length || 0; }
  outstandingCount(checklist: OffboardingChecklist | null): number { return checklist?.items.filter(item => !item.returnedAt).length || 0; }

  checklistAccessories(id: number): AccessoryChecklist {
    return this.accessoriesByAsset()[id] || { charger: false, mouse: false, dockingStation: false, bag: false, adapter: false };
  }
  setAccessory(id: number, key: keyof AccessoryChecklist, value: boolean) {
    this.accessoriesByAsset.update(current => ({ ...current, [id]: { ...this.checklistAccessories(id), [key]: value } }));
  }
  itemCondition(id: number): AssetCondition { return this.conditionByAsset()[id] || 'Good'; }
  setCondition(id: number, condition: string) {
    if (this.conditionOptions.some(option => option.value === condition)) {
      this.conditionByAsset.update(current => ({ ...current, [id]: condition as AssetCondition }));
    }
  }

  async startChecklist(employeeName: string) {
    if (!this.auth.can('offboarding.start')) return;
    this.error.set('');
    const result = await this.data.startOffboardingChecklist(employeeName);
    if (!result.ok) { this.error.set(result.error || `Could not start checklist for ${employeeName}.`); return; }
    this.openedChecklistEmployee.set(employeeName);
    this.ui.success(`Offboarding checklist started for ${result.checklist?.employeeName}.`);
  }

  isChecklistOpen(name: string): boolean { return this.openedChecklistEmployee().toLowerCase() === name.toLowerCase(); }
  openChecklist(name: string) { this.openedChecklistEmployee.set(name); }
  backToOffboarding() { this.openedChecklistEmployee.set(''); }

  async markReturned(employeeName: string, item: OffboardingChecklistItem) {
    if (!this.auth.can('offboarding.return')) return;
    const checklist = this.activeChecklistFor(employeeName);
    if (!checklist || this.busyItem() != null) return;
    const accessories = this.checklistAccessories(item.assetId);
    const condition = this.itemCondition(item.assetId);
    const finalOutstandingItem = this.outstandingCount(checklist) === 1;
    if (finalOutstandingItem) {
      const accessorySummary = item.category === 'Laptop'
        ? ` Laptop accessories confirmed: ${Object.entries(accessories).filter(([, received]) => received).map(([key]) => key).join(', ') || 'none'}.`
        : '';
      const ok = await this.ui.confirm({
        title: 'Complete employee offboarding',
        message: `This is the last outstanding asset for ${employeeName}. Record ${item.name} (${item.serial}) as returned in ${condition} condition.${accessorySummary} This will complete offboarding and move the employee to Former Employees.`,
        confirmLabel: 'Complete offboarding'
      });
      if (!ok) return;
    }
    this.error.set(''); this.busyItem.set(item.assetId);
    const result = await this.data.returnOffboardingItem(checklist.id, item, accessories, condition);
    this.busyItem.set(null);
    if (!result.ok) { this.error.set(result.error || 'Could not record this return.'); return; }
    this.accessoriesByAsset.update(current => { const next = { ...current }; delete next[item.assetId]; return next; });
    this.conditionByAsset.update(current => { const next = { ...current }; delete next[item.assetId]; return next; });
    this.ui.success(condition === 'Good'
      ? `Returned ${item.name} to storage.`
      : `Returned ${item.name}; its inventory status is now Under Repair.`);
  }
}
