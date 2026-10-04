import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { Asset, CommentEntry } from '../../models/models';
import { EmojiPickerComponent } from './emoji-picker.component';

/**
 * Reusable comments popup. Two modes:
 *  - Asset mode:    set [assetId] to a number (null hides). Reads the live asset
 *                   from DataService by id; comments live on asset.comments.
 *  - Employee mode: set [employeeName] to a string (null hides). Reads the live
 *                   thread from DataService.employeeComments()[name].
 * Handle (closed) to clear the id/name. Both threads refresh after every
 * add/edit/delete (which reload the relevant signal). RBAC: add requires a
 * non-viewer; edit/delete require admin or the comment's author.
 */
@Component({
  selector: 'app-comments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, EmojiPickerComponent],
  templateUrl: './comments-modal.component.html'
})
export class CommentsModalComponent {
  private _assetId = signal<number | null>(null);
  @Input() set assetId(v: number | null) {
    this._assetId.set(v ?? null);
    if (v == null) this.resetInputs();
  }
  get assetId(): number | null { return this._assetId(); }

  private _employeeName = signal<string | null>(null);
  @Input() set employeeName(v: string | null) {
    this._employeeName.set(v || null);
    if (!v) this.resetInputs();
  }
  get employeeName(): string | null { return this._employeeName(); }

  private _dellCaseId = signal<number | null>(null);
  @Input() set dellCaseId(value: number | null) {
    this._dellCaseId.set(value ?? null);
    if (value == null) this.resetInputs();
  }
  get dellCaseId(): number | null { return this._dellCaseId(); }

  @Output() closed = new EventEmitter<void>();

  newComment = signal('');
  saving = signal(false);
  editingId = signal<number | null>(null);
  editText = signal('');
  editSaving = signal(false);

  /** True when the modal is showing an employee thread rather than an asset one. */
  isEmployee = computed(() => this._employeeName() != null);
  /** Open when either an asset id or an employee name is set. */
  open = computed(() => this._assetId() != null || this._employeeName() != null || this._dellCaseId() != null);

  asset = computed<Asset | null>(() => {
    const id = this._assetId();
    return id == null ? null : (this.data.assets().find(a => a.id === id) ?? null);
  });

  dellCase = computed(() => {
    const id = this._dellCaseId();
    return id == null ? null : (this.data.dellCases().find(row => row.id === id) ?? null);
  });

  title = computed(() => this.isEmployee() ? (this._employeeName() || '') : this.dellCase() ? `Dell case ${this.dellCase()?.caseId}` : (this.asset()?.name || 'Asset'));
  subtitle = computed(() => this.isEmployee() ? 'Employee notes' : this.dellCase()?.assetSerial || (this.asset()?.serial || ''));

  comments = computed<CommentEntry[]>(() => {
    if (this.isEmployee()) {
      const name = this._employeeName();
      return name ? (this.data.employeeComments()[name] ?? []) : [];
    }
    return this.dellCase()?.comments ?? this.asset()?.comments ?? [];
  });

  constructor(public data: DataService, public auth: AuthService, private ui: UiService) {}

  get canWrite() {
    const permission = this._employeeName() != null ? 'employees.comment' : this._dellCaseId() != null ? 'dellCases.comment' : 'assets.comment';
    return this.auth.can(permission);
  }
  canModify(c: CommentEntry) { return this.canWrite && (this.auth.isAdmin() || c.user === this.auth.currentUser()?.username); }
  commentTime(ts: string) { return new Date(ts).toLocaleString(); }

  close() { this.closed.emit(); }

  private resetInputs() {
    this.newComment.set('');
    this.editingId.set(null);
    this.editText.set('');
  }

  async add() {
    const text = this.newComment().trim();
    if (!text || this.saving()) return;
    this.saving.set(true);
    let res;
    if (this.isEmployee()) {
      const name = this._employeeName();
      res = name ? await this.data.addEmployeeComment(name, text) : { ok: false as const };
    } else if (this._dellCaseId() != null) {
      res = await this.data.addDellCaseComment(this._dellCaseId()!, text);
    } else {
      const id = this._assetId();
      res = id != null ? await this.data.addComment(id, text) : { ok: false as const };
    }
    this.saving.set(false);
    if (!res.ok) { this.ui.error(('error' in res && res.error) || 'Could not add the comment.'); return; }
    this.newComment.set('');
  }

  startEdit(c: CommentEntry) { this.editingId.set(c.id); this.editText.set(c.text); }
  cancelEdit() { this.editingId.set(null); this.editText.set(''); }

  async saveEdit(c: CommentEntry) {
    const text = this.editText().trim();
    if (!text || this.editSaving()) return;
    this.editSaving.set(true);
    let res;
    if (this.isEmployee()) {
      const name = this._employeeName();
      res = name ? await this.data.editEmployeeComment(name, c.id, text) : { ok: false as const };
    } else if (this._dellCaseId() != null) {
      res = await this.data.editDellCaseComment(this._dellCaseId()!, c.id, text);
    } else {
      const id = this._assetId();
      res = id != null ? await this.data.editComment(id, c.id, text) : { ok: false as const };
    }
    this.editSaving.set(false);
    if (!res.ok) { this.ui.error(('error' in res && res.error) || 'Could not update the comment.'); return; }
    this.cancelEdit();
  }

  async remove(c: CommentEntry) {
    if (!this.open()) return;
    const ok = await this.ui.confirm({ title: 'Delete comment', message: 'Delete this comment? This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    let res;
    if (this.isEmployee()) {
      const name = this._employeeName();
      res = name ? await this.data.deleteEmployeeComment(name, c.id) : { ok: false as const };
    } else if (this._dellCaseId() != null) {
      res = await this.data.deleteDellCaseComment(this._dellCaseId()!, c.id);
    } else {
      const id = this._assetId();
      res = id != null ? await this.data.deleteComment(id, c.id) : { ok: false as const };
    }
    if (!res.ok) this.ui.error(('error' in res && res.error) || 'Could not delete the comment.');
  }
}
