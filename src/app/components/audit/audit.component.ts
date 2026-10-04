import { Component, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { Asset, AuditScan, AuditSession } from '../../models/models';
import { exportXlsx } from '../../services/util';

declare const Html5Qrcode: any;

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit.component.html'
})
export class AuditComponent implements OnDestroy {
  newLabel = signal('');
  manualSerial = signal('');
  foundWith = signal('');
  starting = signal(false);

  // Camera scanner state
  scanner: any = null;
  scanning = signal(false);
  cameraError = signal('');
  private lastScanText = '';
  private lastScanAt = 0;

  // History detail view (a completed session the user clicked into)
  viewingId = signal<number | null>(null);

  constructor(public data: DataService, public auth: AuthService, private ui: UiService) {
    this.data.loadAudits();
    if (this.data.assets().length === 0) this.data.loadAssets();
  }

  ngOnDestroy() { this.stopCamera(); }

  // ---- Session selectors ----
  active = computed<AuditSession | null>(() => this.data.audits().find(a => a.status === 'active') || null);
  history = computed<AuditSession[]>(() => this.data.audits().filter(a => a.status === 'completed'));
  viewing = computed<AuditSession | null>(() => {
    const id = this.viewingId();
    return id == null ? null : this.data.audits().find(a => a.id === id) || null;
  });

  // ---- Live reconciliation for the ACTIVE session ----
  private scannedAssetIds = computed<Set<number>>(() => {
    const s = this.active();
    return new Set((s?.scans || []).filter(x => x.assetId != null).map(x => x.assetId as number));
  });
  verifiedAssets = computed<Asset[]>(() => {
    const ids = this.scannedAssetIds();
    return this.data.assets().filter(a => ids.has(a.id));
  });
  missingAssets = computed<Asset[]>(() => {
    const ids = this.scannedAssetIds();
    return this.data.assets().filter(a => !ids.has(a.id));
  });
  unknownScans = computed<AuditScan[]>(() => (this.active()?.scans || []).filter(s => s.assetId == null));
  misplacedScans = computed<AuditScan[]>(() =>
    (this.active()?.scans || []).filter(s => s.assetId != null && s.foundWith && s.foundWith.toLowerCase() !== String(s.expectedAssignee || '').toLowerCase()));
  progressPct = computed(() => {
    const total = this.data.assets().length;
    return total === 0 ? 0 : Math.round((this.verifiedAssets().length / total) * 100);
  });

  // ---- Start / finish / delete ----
  async start() {
    if (this.starting()) return;
    this.starting.set(true);
    const res = await this.data.startAudit(this.newLabel().trim());
    this.starting.set(false);
    if (!res.ok) { this.ui.error(res.error || 'Could not start the audit.'); return; }
    this.newLabel.set('');
    this.ui.success('Audit session started. Begin scanning assets.');
  }

  async finish() {
    const s = this.active();
    if (!s) return;
    const ok = await this.ui.confirm({
      title: 'Finish audit',
      message: `Finish "${s.label}"? ${this.verifiedAssets().length} of ${this.data.assets().length} asset(s) verified. The reconciliation report will be saved.`,
      confirmLabel: 'Finish audit'
    });
    if (!ok) return;
    await this.stopCamera();
    const res = await this.data.finishAudit(s.id);
    if (!res.ok) { this.ui.error(res.error || 'Could not finish the audit.'); return; }
    this.ui.success('Audit finished. Reconciliation report saved.');
    this.viewingId.set(s.id);
  }

  async removeSession(s: AuditSession) {
    const ok = await this.ui.confirm({ title: 'Delete audit', message: `Delete "${s.label}"? This removes the session and its report.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const res = await this.data.deleteAudit(s.id);
    if (!res.ok) { this.ui.error(res.error || 'Could not delete the audit.'); return; }
    if (this.viewingId() === s.id) this.viewingId.set(null);
    this.ui.success('Audit session deleted.');
  }

  // ---- Scanning (manual + camera share this path) ----
  /** Extract the serial from a raw scan payload (the QR encodes ASSETFLOW://SERIAL). */
  private parseSerial(raw: string): string {
    const t = (raw || '').trim();
    return t.replace(/^assetflow:\/\//i, '').trim();
  }

  private async recordScan(rawSerial: string) {
    const s = this.active();
    if (!s) return;
    const serial = this.parseSerial(rawSerial);
    if (!serial) return;
    const res = await this.data.scanAudit(s.id, serial, this.foundWith().trim());
    if (!res.ok) { this.ui.error(res.error || 'Could not record the scan.'); return; }
    if (res.result === 'duplicate') { this.ui.info(`Already scanned: ${serial}`); return; }
    if (res.result === 'unknown') { this.ui.error(`No asset found for serial "${serial}" — recorded as unrecognised.`, 4500); return; }
    this.ui.success(`Verified: ${res.asset?.name || serial}`);
  }

  async submitManual() {
    const serial = this.manualSerial().trim();
    if (!serial) { this.ui.error('Enter a serial number to record.'); return; }
    await this.recordScan(serial);
    this.manualSerial.set('');
  }

  async undoScan(scan: AuditScan) {
    const s = this.active();
    if (!s) return;
    const res = await this.data.removeScan(s.id, scan.serial);
    if (!res.ok) this.ui.error(res.error || 'Could not remove the scan.');
  }

  // ---- Camera control (html5-qrcode) ----
  async toggleCamera() {
    if (this.scanning()) { await this.stopCamera(); return; }
    this.cameraError.set('');
    if (typeof Html5Qrcode === 'undefined') { this.cameraError.set('Scanner library failed to load. Use manual entry instead.'); return; }
    try {
      this.scanner = new Html5Qrcode('audit-reader');
      await this.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded: string) => this.onDecode(decoded),
        () => { /* per-frame decode misses are normal; ignore */ }
      );
      this.scanning.set(true);
    } catch (e: any) {
      this.scanner = null;
      this.cameraError.set('Could not access the camera. Grant camera permission (or use manual entry). Camera needs localhost or HTTPS.');
    }
  }

  private onDecode(decoded: string) {
    // Debounce: the camera fires many times per second on the same code.
    const now = Date.now();
    if (decoded === this.lastScanText && now - this.lastScanAt < 2500) return;
    this.lastScanText = decoded;
    this.lastScanAt = now;
    this.recordScan(decoded);
  }

  async stopCamera() {
    if (this.scanner && this.scanning()) {
      try { await this.scanner.stop(); this.scanner.clear(); } catch { /* already stopped */ }
    }
    this.scanner = null;
    this.scanning.set(false);
  }

  // ---- History view ----
  openHistory(s: AuditSession) { this.viewingId.set(s.id); }
  closeHistory() { this.viewingId.set(null); }

  fmt(iso: string | null): string { return iso ? new Date(iso).toLocaleString() : '—'; }

  exportActive() {
    const s = this.active();
    if (!s) return;
    const rows: any[] = [];
    for (const a of this.verifiedAssets()) rows.push({ 'Result': 'Verified present', 'Asset': a.name, 'Serial': a.serial, 'Assigned To': a.assignedTo });
    for (const a of this.missingAssets()) rows.push({ 'Result': 'Missing (not scanned)', 'Asset': a.name, 'Serial': a.serial, 'Assigned To': a.assignedTo });
    for (const sc of this.misplacedScans()) rows.push({ 'Result': 'Misplaced', 'Asset': sc.assetName, 'Serial': sc.serial, 'Assigned To': `expected ${sc.expectedAssignee}, found with ${sc.foundWith}` });
    for (const sc of this.unknownScans()) rows.push({ 'Result': 'Unrecognised serial', 'Asset': '', 'Serial': sc.serial, 'Assigned To': '' });
    exportXlsx(rows, 'Reconciliation', `AssetFlow_Audit_${s.id}.xlsx`);
  }
}

