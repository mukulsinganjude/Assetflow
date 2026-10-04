import { Injectable, signal } from '@angular/core';
import { FormerEmployeeRecord } from '../models/models';

export type ToastType = 'success' | 'error' | 'info';
export interface Toast { id: number; message: string; type: ToastType; }
export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

@Injectable({ providedIn: 'root' })
export class UiService {
  // ---- Former employee asset details ----
  formerEmployeeAssetDetails = signal<FormerEmployeeRecord | null>(null);
  showFormerEmployeeAssetDetails(record: FormerEmployeeRecord) { this.formerEmployeeAssetDetails.set(record); }
  closeFormerEmployeeAssetDetails() { this.formerEmployeeAssetDetails.set(null); }

  // ---- QR modal (existing) ----
  qrVisible = signal(false);
  qrTitle = signal('Hardware Tag');
  qrSerial = signal('SN-000000');

  showQr(name: string, serial: string) {
    this.qrTitle.set(name);
    this.qrSerial.set(serial);
    this.qrVisible.set(true);
  }
  closeQr() { this.qrVisible.set(false); }

  // ---- Theme settings panel ----
  themeSettingsOpen = signal(false);
  openThemeSettings() { this.themeSettingsOpen.set(true); }
  closeThemeSettings() { this.themeSettingsOpen.set(false); }

  // ---- Toast notifications ----
  toasts = signal<Toast[]>([]);
  private toastSeq = 0;

  toast(message: string, type: ToastType = 'info', durationMs = 3600) {
    const id = ++this.toastSeq;
    this.toasts.update(list => [...list, { id, message, type }]);
    if (durationMs > 0) setTimeout(() => this.dismissToast(id), durationMs);
    return id;
  }
  success(message: string, durationMs = 3600) { return this.toast(message, 'success', durationMs); }
  error(message: string, durationMs = 5000) { return this.toast(message, 'error', durationMs); }
  info(message: string, durationMs = 3600) { return this.toast(message, 'info', durationMs); }
  dismissToast(id: number) { this.toasts.update(list => list.filter(t => t.id !== id)); }

  // ---- Confirmation dialog (promise-based) ----
  confirmState = signal<ConfirmState | null>(null);
  private confirmResolver: ((ok: boolean) => void) | null = null;

  /** Opens a styled confirm dialog and resolves true/false when the user chooses. */
  confirm(opts: { message: string; title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
    // Resolve any dialog already open (shouldn't normally happen) as cancelled.
    if (this.confirmResolver) { this.confirmResolver(false); this.confirmResolver = null; }
    this.confirmState.set({
      title: opts.title ?? 'Please confirm',
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false
    });
    return new Promise<boolean>(resolve => { this.confirmResolver = resolve; });
  }

  /** Shared guard for spreadsheet imports: bound client work and make partial
   *  imports explicit before sending the file's rows to the API. */
  confirmImport(rowCount: number, subject: string): Promise<boolean> {
    if (!Number.isInteger(rowCount) || rowCount <= 0) {
      this.error('The spreadsheet has no data rows to import.');
      return Promise.resolve(false);
    }
    if (rowCount > 5000) {
      this.error('Imports are limited to 5,000 rows at a time. Split the spreadsheet and retry.', 7000);
      return Promise.resolve(false);
    }
    return this.confirm({
      title: `Review ${subject} import`,
      message: `The spreadsheet contains ${rowCount} row(s). Rows that fail validation will be skipped, and the API will report their row numbers after import. Continue?`,
      confirmLabel: `Import ${rowCount} rows`
    });
  }

  resolveConfirm(ok: boolean) {
    this.confirmState.set(null);
    const resolve = this.confirmResolver;
    this.confirmResolver = null;
    if (resolve) resolve(ok);
  }
}
