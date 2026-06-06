import type { DocumentDiagnostic } from '@/src/score-core/commands/apply-document-commands';

export type DoctorDomain =
  | 'document'
  | 'input'
  | 'rhythm'
  | 'layout'
  | 'theory'
  | 'playback'
  | 'export';

export type DoctorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type DoctorMode = 'off' | 'live' | 'strict' | 'manual';

export type DoctorTrigger =
  | 'load'
  | 'replace'
  | 'apply'
  | 'undo'
  | 'redo'
  | 'manual'
  | 'render'
  | 'input'
  | 'unknown';

export type DoctorRuleStatus = 'active' | 'planned';

export interface DoctorRule {
  id: string;
  domain: DoctorDomain;
  title: string;
  description: string;
  severity: DoctorSeverity;
  status: DoctorRuleStatus;
  trigger: DoctorTrigger | 'any';
}

export interface DoctorSettings {
  enabled: boolean;
  mode: DoctorMode;
  domains: DoctorDomain[];
  strict: boolean;
  visual: boolean;
  source: 'url' | 'local-storage' | 'env' | 'default';
}

export interface DoctorIssue {
  id: string;
  ruleId: string;
  domain: DoctorDomain;
  severity: DoctorSeverity;
  title: string;
  message: string;
  newSincePrevious?: boolean;
  measureNumber?: number;
  staffIndex?: number;
  voiceId?: number;
  timestamp?: string;
  data?: unknown;
}

export interface DoctorReport {
  schemaVersion: 1;
  kind: 'nex-note-doctor-report';
  generatedAt: string;
  mode: DoctorMode;
  trigger: DoctorTrigger;
  enabledDomains: DoctorDomain[];
  revision: number | null;
  previousRevision?: number | null;
  commandCount: number;
  commandTypes: string[];
  rules: {
    active: number;
    planned: number;
    byDomain: Record<DoctorDomain, { active: number; planned: number }>;
  };
  issueCount: number;
  warningCount: number;
  errorCount: number;
  issues: DoctorIssue[];
  diagnostics: DocumentDiagnostic[];
  summary: {
    clean: boolean;
    blocked: boolean;
    newIssueCount: number;
    newBlockingIssueCount: number;
    affectedMeasures: number[];
    affectedStaves: number[];
    affectedVoices: number[];
  };
}
