import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

interface Feature { icon: string; title: string; desc: string; tile?: 'green' | 'orange'; }
interface Role { icon: string; name: string; tag: string; desc: string; highlight?: boolean; }

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html'
})
export class LandingComponent {
  /** Emitted when a "Login" / "Get Started" CTA is clicked. */
  @Output() login = new EventEmitter<void>();

  year = new Date().getFullYear();
  mobileNavOpen = false;

  constructor(public theme: ThemeService) {}

  openLogin() { this.login.emit(); }
  toggleTheme() { this.theme.toggle(); }
  toggleMobileNav() { this.mobileNavOpen = !this.mobileNavOpen; }
  closeMobileNav() { this.mobileNavOpen = false; }

  features: Feature[] = [
    { icon: 'fa-circle-plus', title: 'Dedicated Asset Entry', desc: 'Register hardware in seconds with QR-tagged records, serials, specs and warranty in one clean portal.', tile: 'green' },
    { icon: 'fa-users', title: 'Employee Assignments', desc: 'Track who holds what. Assign, reassign and hand over equipment with a full per-person history.', tile: 'green' },
    { icon: 'fa-shield-halved', title: 'Warranty & Forecasting', desc: 'Predict replacements before they fail. Automatic expiry alerts keep your fleet ahead of downtime.', tile: 'orange' },
    { icon: 'fa-boxes-stacked', title: 'Consumables Inventory', desc: 'Monitor stock levels of cables, toners and spares with low-stock thresholds and reorder signals.', tile: 'green' },
  ];

  roles: Role[] = [
    { icon: 'fa-user-shield', name: 'Administrator', tag: 'Full control', desc: 'Manage users, restore snapshots and configure every module across the fleet.', highlight: true },
    { icon: 'fa-pen-to-square', name: 'Data Entry', tag: 'Operational', desc: 'Register and assign assets, log consumables and keep records current — without admin access.' },
    { icon: 'fa-eye', name: 'Viewer', tag: 'Read-only', desc: 'Explore dashboards, employee assignments and reports safely with view-only permissions.' }
  ];
}
