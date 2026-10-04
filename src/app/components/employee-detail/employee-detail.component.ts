import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { Asset, CommentEntry, HistoryEntry } from '../../models/models';
import { EmojiPickerComponent } from '../shared/emoji-picker.component';
import { DellCasePopupComponent } from '../shared/dell-case-popup.component';

interface TimelineItem extends HistoryEntry {
  assetId: number;
  assetName: string;
  serial: string;
}

/**
 * Full-page view of a single employee (employees have no backend entity — they
 * are derived from asset.assignedTo). Shows their assigned equipment, a merged
 * lifecycle timeline across all their assets, and the per-employee comment
 * thread (stored in DataService.employeeComments, keyed by name).
 */
@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EmojiPickerComponent, DellCasePopupComponent],
  templateUrl: './employee-detail.component.html'
})
export class EmployeeDetailComponent {
  linkedDellCaseId = signal<number | null>(null);
  linkedDellCaseAsset = signal<Asset | null>(null);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ui = inject(UiService);
  data = inject(DataService);
  auth = inject(AuthService);

  /** Employee name from the route param (reacts to param changes). The router
   *  already URL-decodes param values, so decoding again would throw a URIError
   *  on names containing '%' or '&'. */
  name = toSignal(this.route.paramMap.pipe(map(p => p.get('name') || '')), { initialValue: '' });

  constructor() { this.data.loadEmployees(); }

  openDellCase(caseId: number | null, event: Event) { event.stopPropagation(); if (caseId != null) this.linkedDellCaseId.set(caseId); }
  openDellCaseForAsset(asset: Asset, event: Event) { event.stopPropagation(); this.linkedDellCaseId.set(null); this.linkedDellCaseAsset.set(asset); }
  closeDellCase() { this.linkedDellCaseId.set(null); this.linkedDellCaseAsset.set(null); }

  assets = computed<Asset[]>(() => this.data.assets().filter(a => a.assignedTo === this.name()));
  primaryLaptops = computed<Asset[]>(() => this.assets().filter(a =>
    String(a.category || '').trim().toLowerCase() === 'laptop' &&
    String(a.assignmentType || 'Primary').trim().toLowerCase() === 'primary'
  ));
  employee = computed(() => this.data.employeeRoster().find(e => e.name.toLowerCase() === this.name().toLowerCase()));
  department = computed(() => this.employee()?.department || this.assets()[0]?.department || '—');
  exists = computed(() => !!this.employee() || this.assets().length > 0 || (this.data.employeeComments()[this.name()]?.length ?? 0) > 0);

  stats = computed(() => {
    const list = this.assets();
    return {
      total: list.length,
      inUse: list.filter(a => a.status === 'In Use').length,
      inStorage: list.filter(a => a.status === 'In Storage').length,
      underRepair: list.filter(a => a.status === 'Under Repair').length
    };
  });

  /** All history entries across the employee's assets, merged newest-first. */
  timeline = computed<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const a of this.assets()) {
      for (const h of (a.history ?? [])) items.push({ ...h, assetId: a.id, assetName: a.name, serial: a.serial });
    }
    return items.sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
  });

  comments = computed<CommentEntry[]>(() => this.data.employeeComments()[this.name()] ?? []);

  // ---- comment composer ----
  newComment = signal('');
  saving = signal(false);
  editingId = signal<number | null>(null);
  editText = signal('');
  editSaving = signal(false);

  // ---- in-page asset detail popup (opened from Assigned Equipment / timeline) ----
  viewAssetId = signal<number | null>(null);
  viewAsset = computed<Asset | null>(() => {
    const id = this.viewAssetId();
    return id == null ? null : (this.data.assets().find(a => a.id === id) ?? null);
  });
  assetHistory = computed<HistoryEntry[]>(() =>
    [...(this.viewAsset()?.history ?? [])].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  );
  openAsset(a: Asset) { this.viewAssetId.set(a.id); }
  openAssetById(id: number) {
    const a = this.assets().find(x => x.id === id);
    if (a) this.viewAssetId.set(a.id);
  }
  closeAsset() { this.viewAssetId.set(null); }

  get canWrite() { return this.auth.can('employees.comment'); }
  canModify(c: CommentEntry) { return this.canWrite && (this.auth.isAdmin() || c.user === this.auth.currentUser()?.username); }
  fmt(ts: string) { return new Date(ts).toLocaleString(); }

  back() { this.router.navigate(['/employees']); }

  statusClass(status: string): string {
    if (status === 'In Use') return 'bg-emerald-500/10 text-emerald-400';
    if (status === 'Under Repair') return 'bg-amber-500/10 text-amber-400';
    return 'bg-slate-500/10 text-slate-400';
  }

  catIcon(cat: string): string {
    switch (cat) {
      case 'Laptop': return 'fa-laptop';
      case 'Monitor': return 'fa-desktop';
      case 'Mouse': return 'fa-computer-mouse';
      case 'Docking Station': return 'fa-plug';
      case 'Headset': return 'fa-headset';
      default: return 'fa-box';
    }
  }

  async add() {
    const text = this.newComment().trim();
    if (!text || this.saving()) return;
    this.saving.set(true);
    const res = await this.data.addEmployeeComment(this.name(), text);
    this.saving.set(false);
    if (!res.ok) { this.ui.error(res.error || 'Could not add the comment.'); return; }
    this.newComment.set('');
  }

  startEdit(c: CommentEntry) { this.editingId.set(c.id); this.editText.set(c.text); }
  cancelEdit() { this.editingId.set(null); this.editText.set(''); }

  async saveEdit(c: CommentEntry) {
    const text = this.editText().trim();
    if (!text || this.editSaving()) return;
    this.editSaving.set(true);
    const res = await this.data.editEmployeeComment(this.name(), c.id, text);
    this.editSaving.set(false);
    if (!res.ok) { this.ui.error(res.error || 'Could not update the comment.'); return; }
    this.cancelEdit();
  }

  async remove(c: CommentEntry) {
    const ok = await this.ui.confirm({ title: 'Delete comment', message: 'Delete this comment? This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const res = await this.data.deleteEmployeeComment(this.name(), c.id);
    if (!res.ok) this.ui.error(res.error || 'Could not delete the comment.');
  }

  historyIcon(action: string): { icon: string; color: string } {
    const a = action.toLowerCase();
    if (a.includes('registered')) return { icon: 'fa-circle-plus', color: 'text-emerald-400' };
    if (a.includes('return')) return { icon: 'fa-rotate-left', color: 'text-amber-400' };
    if (a.includes('warranty')) return { icon: 'fa-shield-halved', color: 'text-sky-400' };
    if (a.includes('status')) return { icon: 'fa-arrows-rotate', color: 'text-indigo-400' };
    if (a.includes('comment')) return { icon: 'fa-comment', color: 'text-purple-400' };
    return { icon: 'fa-pen', color: 'text-slate-400' };
  }
}
