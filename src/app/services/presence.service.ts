import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface OnlinePerson {
  displayName: string;
  title: string;
  lastSeen: string;
}

@Injectable({ providedIn: 'root' })
export class PresenceService {
  readonly onlinePeople = signal<OnlinePerson[]>([]);
  private sessionId = '';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void this.announce();
    }
  };

  constructor(private api: ApiService) {}

  start() {
    if (this.heartbeatTimer) return;
    this.sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.announce();
    this.heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.sendHeartbeat();
    }, 25_000);
    this.refreshTimer = setInterval(() => void this.refresh(), 20_000);
  }

  stop() {
    const sessionId = this.sessionId;
    if (sessionId) {
      void firstValueFrom(this.api.post<{ ok: boolean }>('/presence/offline', { sessionId })).catch(() => {});
    }
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.heartbeatTimer = null;
    this.refreshTimer = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.sessionId = '';
    this.onlinePeople.set([]);
  }

  private async sendHeartbeat() {
    if (!this.sessionId) return;
    try { await firstValueFrom(this.api.post<{ ok: boolean }>('/presence/heartbeat', { sessionId: this.sessionId })); }
    catch { /* A temporary network error is recovered by the next heartbeat. */ }
  }

  private async announce() {
    await this.sendHeartbeat();
    await this.refresh();
  }

  private async refresh() {
    try { this.onlinePeople.set(await firstValueFrom(this.api.get<OnlinePerson[]>('/presence'))); }
    catch { /* Keep the last successful list while the API is briefly unavailable. */ }
  }

  refreshNow() { void this.refresh(); }
}
