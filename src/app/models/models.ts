export type Role = 'admin' | 'entry' | 'viewer';
export type AssetStatus = 'In Use' | 'In Storage' | 'Under Repair';
export type AssetCategory = 'Laptop' | 'Monitor' | 'Mouse' | 'Docking Station' | 'Headset';
export type AssetAssignmentType = 'Primary' | 'Temporary';
export type AssetCondition = 'Good' | 'Damaged' | 'Needs repair';

export interface AccessoryChecklist {
  charger: boolean;
  mouse: boolean;
  dockingStation: boolean;
  bag: boolean;
  adapter: boolean;
}

export interface HistoryEntry {
  /** ISO timestamp of when the event was recorded. */
  ts: string;
  /** Username of the actor (or 'System' for seeded/automatic entries). */
  user: string;
  /** Human-readable description of what changed. */
  action: string;
  /** Structured custody change for assignment/check-in events. */
  from?: string;
  to?: string;
  handoverChecklist?: { stage: 'issued' | 'returned'; accessories: AccessoryChecklist };
  condition?: AssetCondition;
}

export interface CommentEntry {
  /** Unique id within the owning asset. */
  id: number;
  /** ISO timestamp of when the comment was posted. */
  ts: string;
  /** ISO timestamp of the last edit, if the comment has been edited. */
  editedTs?: string;
  /** Username of the author. */
  user: string;
  /** Display name of the author, joined by the API for presentation. */
  authorName?: string;
  /** Free-text note. */
  text: string;
}

export interface Asset {
  id: number;
  name: string;
  category: string;
  department: string;
  serial: string;
  /** Whether the assigned equipment is the employee's primary or temporary item. */
  assignmentType?: AssetAssignmentType;
  assignedTo: string;
  status: string;
  /** Condition recorded when this asset was returned during employee offboarding. */
  offboardingCondition?: AssetCondition;
  purchaseDate: string;
  warrantyDate: string;
  /** Lifecycle timeline (newest first). Optional — legacy assets may not have one yet. */
  history?: HistoryEntry[];
  /** Free-text comments/notes (newest first). Optional. */
  comments?: CommentEntry[];
}

/** Client-facing user — the server never sends password hashes or security answers. */
export interface User {
  username: string;
  /** Company sign-in address. Optional only for legacy accounts awaiting migration. */
  email?: string;
  role: Role;
  displayName?: string;
  /** Administrator-managed job title shown in account menus. */
  title?: string;
  profileImage?: string;
  /** Null means inherit the standard role defaults; an array is a per-user override. */
  permissions?: string[] | null;
}

export interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

/** A person in the employee roster that assets can be assigned to. */
export interface Employee {
  name: string;
  department: string;
  /** Company CCIID numeric suffix; display as CCI + suffix. */
  cciId?: string;
}

/** A single fixed desk peripheral tracked by desk — a Monitor or Docking Station. */
export interface DeskPeripheral {
  id: number;
  deskNo: string;
  /** Which kind of peripheral this row records: 'Monitor' or 'Docking Station'. */
  category: string;
  /** Item model / name, chosen from the catalog for the selected category. */
  model: string;
  /** Serial number of the physical unit. */
  serial: string;
}

export interface FormerEmployeeRecord {
  id: number;
  name: string;
  department: string;
  cciId?: string;
  leftAt: string;
  archivedBy: string;
  assets: Asset[];
}

export interface OffboardingChecklistItem {
  assetId: number;
  name: string;
  category: string;
  serial: string;
  returnedAt?: string;
  returnedBy?: string;
  returnedAccessories?: AccessoryChecklist;
  returnedCondition?: AssetCondition;
}

export interface OffboardingChecklist {
  id: number;
  employeeName: string;
  startedAt: string;
  updatedAt: string;
  startedBy: string;
  completedAt?: string;
  items: OffboardingChecklistItem[];
}

export type DellCaseStatus = 'Resolved' | 'Unresolved' | 'Closed without resolved';
export interface DellCase {
  id: number;
  employeeName: string;
  category?: string;
  assetModel: string;
  assetSerial: string;
  registeredDate: string;
  caseId: string;
  issueDescription: string;
  registeredBy: string;
  status: DellCaseStatus;
  updatedAt: string;
  comments?: CommentEntry[];
}

export interface QuickLink {
  id: number;
  name: string;
  url: string;
  purpose: string;
  createdBy: string;
  createdAt: string;
}

/** Quantity-tracked stock line (cables, adapters, etc.) — distinct from serial-tracked assets. */
export interface Consumable {
  id: number;
  name: string;
  category: string;
  quantity: number;
  reorderThreshold: number;
  unit: string;
  location: string;
  notes: string;
  /** ISO timestamp of the last change. */
  updatedAt?: string;
}
