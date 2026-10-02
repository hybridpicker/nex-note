'use client';

import { buildPartsArchive } from '@/lib/parts-archive';
import { formatShortcutHint } from '@/lib/shortcut-hints';
import { use, useState, useCallback, useEffect, useLayoutEffect, useRef, startTransition, useMemo, useDeferredValue, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { flushSync } from 'react-dom';
import ProviderSelector from '@/components/ProviderSelector';
import AiModelSettingsPanel from '@/components/AiModelSettings';
import type { BenchmarkResult, SuiteResult, OllamaSuiteRow } from '@/components/BenchmarkPanel';
import type { DialogTab } from '@/components/NewScoreDialog';
import type { EditPaletteSectionId } from '@/components/EditPalette';
import LeftNotationSidebar from '@/components/LeftNotationSidebar';
import IpadSelectionActions from '@/components/IpadSelectionActions';
import NoteInputToolbar from '@/components/NoteInputToolbar';
import NotationToolbar from '@/components/NotationToolbar';
import ScoreInspector from '@/components/ScoreInspector';
import type { CommandCenterAction } from '@/components/CommandCenter';
import FileMenu, { type FileMenuItem } from '@/components/FileMenu';
import NexNoteBrand from '@/components/NexNoteBrand';
import type { AiConnectionState } from '@/components/WelcomeScreen';
import LanguageSettings from '@/components/LanguageSettings';
import type { ProviderName } from '@/lib/ai-provider-config';
import { BENCHMARK_SUITE, OLLAMA_MODEL_SUITE } from '@/lib/benchmark-suite';
import { OLLAMA_MODELS } from '@/lib/ai-provider-config';
import {
  AI_PROVIDER_ORDER,
  DEFAULT_AI_MODEL_SETTINGS,
  buildAiProviderRequestSettings,
  mergeModelOptions,
  normalizeAiModelSettings,
  readAiModelSettings,
  writeAiModelSettings,
  type AiModelSettings,
} from '@/lib/ai-model-settings';
import { buildNxnFilename, createNxnFile, downloadNxnFile, isNxnFilename, readNxnFile } from '@/lib/nxn-file';
import {
  chooseBugReportDirectoryHandle,
  formatBugReportDirectoryLabel,
  getSavedBugReportDirectoryHandle,
  supportsBugReportDirectoryExport,
} from '@/lib/bug-report-directory';
import {
  formatNxnProjectDirectoryLabel,
  getSavedNxnProjectDirectoryHandle,
  hasNxnProjectDirectoryPermission,
  readNxnProjectFile,
  supportsNxnProjectDirectoryStorage,
  writeNxnProjectFile,
} from '@/lib/nxn-project-directory';
import { buildBugReportBundle, exportBugReportBundle, type BugReportChatMessage } from '@/lib/bug-report-export';
import { isDebugEnabled } from '@/lib/debug';
import { serializeEditorSelection } from '@/lib/chat-selection';
import { recordBugReportEvent, setBugReportContext } from '@/lib/bug-report-recorder';
import { usePlayback } from '@/hooks/usePlayback';
import type { PlaybackSampleBank } from '@/lib/playback-sample-bank';
import { AdvancedNoteInput } from '@/components/AdvancedNoteInput';
import { useMidiRecording } from '@/hooks/useMidiRecording';
import { useMidiInput } from '@/hooks/useMidiInput';
import {
  useMicrophonePitchInput,
  type MicrophoneDetectionMode,
} from '@/hooks/useMicrophonePitchInput';
import { useNoteEditor, type ArticulationKind, type BarlineKind, type DynamicKind, type SelectedNote } from '@/hooks/useNoteEditor';
import { useScoreDocument, type ScoreDocumentSelectionAnchor } from '@/hooks/useScoreDocument';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { buildExtractedPartFilename, extractPartMusicXml } from '@/lib/part-extraction';
import { saveLibraryScore, touchLibraryScore, type LibraryScore } from '@/lib/score-library';
import { addRecentFile } from '@/lib/recent-files';
import {
  buildImportPolishMessage,
  getImportPolishSourceFormat,
  shouldAcceptPolishedImportXml,
  shouldAutoApplyImportPolishCommands,
  shouldPolishImportedScore,
  type ImportPolishSourceFormat,
} from '@/lib/import-ai-polish';
import { buildChatScoreKey } from '@/lib/chat-task-state';
import type { ScoreCommand } from '@/lib/score-commands';
import { buildNewScoreFilename, createDefaultNewScoreDraft, createNewScoreXml, type NewScoreDraft } from '@/lib/new-score';
import { buildScoreImageBatchBaseName, isScoreImageFilename, sortScoreImagePages } from '@/lib/score-image-pages';
import {
  dedupeUserTemplates,
  findUserTemplateForSamplePlayback,
  normalizeUserTemplatesFromFolder,
  type ElectronUserTemplateFolderPayload,
  type UserScoreTemplate,
} from '@/lib/score-templates';
import type { DragTransposeMode } from '@/src/score-input/transpose-logic';
import { buildSemanticSelectionEntries } from '@/src/score-core/query/note-editor';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import { buildDocumentDoctorReport } from '@/src/debug/doctor/document-doctor';
import { readDoctorSettings } from '@/src/debug/doctor/flags';
import { getDoctorRuntimeState, publishDoctorReport, registerDoctorRunner } from '@/src/debug/doctor/runtime';
import type { DoctorDomain } from '@/src/debug/doctor/types';
import { useI18n } from '@/lib/i18n';
import { writeLeftNotationSidebarCollapsed } from '@/lib/left-notation-sidebar';
import { type NativeEditCommand, shouldUseNativeMenuClipboardCommand, shouldUseNativeMenuHistoryCommand } from '@/lib/native-clipboard-shortcuts';
import { preferFlatsForKeySignature } from '@/src/score-input/midi-input';

const ScoreEditor = dynamic(() => import('@/components/ScoreEditor'), { ssr: false });
const ScorePreview = dynamic(() => import('@/components/ScorePreview'), { ssr: false });
const ChatPanel = dynamic(() => import('@/components/ChatPanel'), { ssr: false });
const BenchmarkPanel = dynamic(() => import('@/components/BenchmarkPanel'), { ssr: false });
const NewScoreDialog = dynamic(() => import('@/components/NewScoreDialog'), { ssr: false });
const EditLibrary = dynamic(() => import('@/components/EditLibrary'), { ssr: false });
const EditPalette = dynamic(() => import('@/components/EditPalette'), { ssr: false });
const ScoreLibrary = dynamic(() => import('@/components/ScoreLibrary'), { ssr: false });
const BugReportDialog = dynamic(() => import('@/components/BugReportDialog'), { ssr: false });
const CommandCenter = dynamic(() => import('@/components/CommandCenter'), { ssr: false });
const WelcomeScreen = dynamic(() => import('@/components/WelcomeScreen'), { ssr: false });

const IMPORT_FILE_ACCEPT = '.nxn,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.bmp,.heic,.heif,.mxl,.xml,.musicxml,.mscz,.mid,.midi,.gp,.gp4,.gp5,.gp6,.gpx';
const DEFERRED_IMPORT_XML_BYTES = 96 * 1024;

type ImportLifecyclePhase = 'idle' | 'received' | 'parsedXml' | 'coreBuilt' | 'osmdRendered' | 'debugGridReady' | 'midiReady';

interface ImportLifecycleState {
  phase: ImportLifecyclePhase;
  xml: string;
  filename: string;
  deferred: boolean;
  startedAt: number;
  osmdRenderedAt: number | null;
}

type ElectronOpenFilePayload = {
  name: string;
  type?: string;
  base64: string;
};

type ElectronOpenFilesPayload = {
  name?: string;
  files: ElectronOpenFilePayload[];
};

type ElectronOpenPayload = ElectronOpenFilePayload | ElectronOpenFilesPayload;

type NexNoteElectronApi = {
  isElectron: true;
  onMenuCommand: (callback: (commandId: string) => void) => () => void;
  onOpenFile: (callback: (payload: ElectronOpenPayload) => void) => () => void;
  openFileDialog: () => Promise<void>;
  listUserTemplates: () => Promise<ElectronUserTemplateFolderPayload[]>;
  readUserTemplateSample: (payload: {
    sourceLabel: string;
    directory: string;
    filename: string;
  }) => Promise<ArrayBuffer | Uint8Array>;
  performNativeEditCommand: (command: NativeEditCommand) => Promise<void>;
  exportPdf?: (suggestedName: string) => Promise<{ ok: boolean; reason?: string }>;
  updateMenuState: (state: {
    hasScore: boolean;
    hasCoreDocument: boolean;
    canUndo: boolean;
    canRedo: boolean;
    hasSelection: boolean;
    activeViewMode: ScoreViewModeCommand;
    printView: boolean;
  }) => void;
};

declare global {
  interface Window {
    nexNoteElectron?: NexNoteElectronApi;
  }
}

function getNexNoteElectronApi() {
  if (typeof window === 'undefined') return undefined;
  return window.nexNoteElectron;
}

type OllamaModelOption = { id: string; label: string };

const COMMAND_CENTER_TRANSPOSE_ACTIONS = [
  { id: 'transpose-down-octave', titleKey: 'command.transpose.downOctave.title', semitones: -12 },
  { id: 'transpose-down-semitone', titleKey: 'command.transpose.downSemitone.title', semitones: -1, shortcut: 'ArrowDown' },
  { id: 'transpose-up-semitone', titleKey: 'command.transpose.upSemitone.title', semitones: 1, shortcut: 'ArrowUp' },
  { id: 'transpose-up-octave', titleKey: 'command.transpose.upOctave.title', semitones: 12 },
] as const;

const COMMAND_CENTER_ARTICULATION_ACTIONS: Array<{
  id: string;
  titleKey: 'command.articulation.staccato.title' | 'command.articulation.accent.title' | 'command.articulation.marcato.title' | 'command.articulation.tenuto.title';
  articulation: ArticulationKind;
  shortcut: string;
}> = [
  { id: 'articulation-staccato', titleKey: 'command.articulation.staccato.title', articulation: 'staccato', shortcut: 'Shift S' },
  { id: 'articulation-accent', titleKey: 'command.articulation.accent.title', articulation: 'accent', shortcut: 'Shift .' },
  { id: 'articulation-marcato', titleKey: 'command.articulation.marcato.title', articulation: 'strong-accent', shortcut: 'Shift 6' },
  { id: 'articulation-tenuto', titleKey: 'command.articulation.tenuto.title', articulation: 'tenuto', shortcut: 'Shift -' },
];

const COMMAND_CENTER_DYNAMIC_ACTIONS: Array<{
  id: string;
  titleKey: 'command.dynamic.pp.title' | 'command.dynamic.p.title' | 'command.dynamic.mp.title' | 'command.dynamic.mf.title' | 'command.dynamic.f.title' | 'command.dynamic.ff.title';
  dynamic: DynamicKind;
}> = [
  { id: 'dynamic-pp', titleKey: 'command.dynamic.pp.title', dynamic: 'pp' },
  { id: 'dynamic-p', titleKey: 'command.dynamic.p.title', dynamic: 'p' },
  { id: 'dynamic-mp', titleKey: 'command.dynamic.mp.title', dynamic: 'mp' },
  { id: 'dynamic-mf', titleKey: 'command.dynamic.mf.title', dynamic: 'mf' },
  { id: 'dynamic-f', titleKey: 'command.dynamic.f.title', dynamic: 'f' },
  { id: 'dynamic-ff', titleKey: 'command.dynamic.ff.title', dynamic: 'ff' },
];

const COMMAND_CENTER_BARLINE_ACTIONS: Array<{
  id: string;
  titleKey: 'command.barline.double.title' | 'command.barline.final.title' | 'command.barline.repeatStart.title' | 'command.barline.repeatEnd.title';
  barline: BarlineKind;
}> = [
  { id: 'barline-double', titleKey: 'command.barline.double.title', barline: 'double' },
  { id: 'barline-final', titleKey: 'command.barline.final.title', barline: 'final' },
  { id: 'barline-repeat-start', titleKey: 'command.barline.repeatStart.title', barline: 'repeat-start' },
  { id: 'barline-repeat-end', titleKey: 'command.barline.repeatEnd.title', barline: 'repeat-end' },
];

const COMMAND_CENTER_VOICE_ACTIONS = ([1, 2, 3, 4] as const).map((voice) => ({
  id: `set-active-voice-${voice}`,
  voice,
  shortcut: `Cmd Alt ${voice}`,
}));

const COMMAND_CENTER_STRUCTURE_ACTIONS = [
  {
    id: 'structure-add-start-repeat',
    titleKey: 'command.structure.startRepeat.title',
    descriptionKey: 'command.structure.startRepeat.description',
    keywords: ['repeat start', 'forward repeat', 'volta'],
    buildCommands: (_measureNumber: number): ScoreCommand[] => [{ type: 'addStartRepeat' }],
    label: 'Start repeat',
  },
  {
    id: 'structure-add-end-repeat',
    titleKey: 'command.structure.endRepeat.title',
    descriptionKey: 'command.structure.endRepeat.description',
    keywords: ['repeat end', 'backward repeat', 'volta'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'addEndRepeat', measureNumber }],
    label: 'End repeat',
  },
  {
    id: 'structure-set-ending-1',
    titleKey: 'command.structure.firstEnding.title',
    descriptionKey: 'command.structure.firstEnding.description',
    keywords: ['ending 1', 'volta 1', 'first ending'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'setEnding', measureNumber, number: '1', endingType: 'start' }],
    label: 'Ending 1',
  },
  {
    id: 'structure-set-ending-2',
    titleKey: 'command.structure.secondEnding.title',
    descriptionKey: 'command.structure.secondEnding.description',
    keywords: ['ending 2', 'volta 2', 'second ending'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'setEnding', measureNumber, number: '2', endingType: 'start' }],
    label: 'Ending 2',
  },
  {
    id: 'structure-insert-measure-after',
    titleKey: 'command.structure.insertMeasureAfter.title',
    descriptionKey: 'command.structure.insertMeasureAfter.description',
    keywords: ['measure insert bar add'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'insertMeasureAfter', measureNumber }],
    label: 'Insert measure',
  },
  {
    id: 'structure-delete-measure',
    titleKey: 'command.structure.deleteMeasure.title',
    descriptionKey: 'command.structure.deleteMeasure.description',
    keywords: ['measure delete remove bar'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'deleteMeasure', measureNumber }],
    label: 'Delete measure',
  },
  {
    id: 'structure-system-break',
    titleKey: 'command.structure.systemBreak.title',
    descriptionKey: 'command.structure.systemBreak.description',
    keywords: ['layout system break line break'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'setSystemBreak', measureNumber }],
    label: 'System break',
  },
  {
    id: 'structure-page-break',
    titleKey: 'command.structure.pageBreak.title',
    descriptionKey: 'command.structure.pageBreak.description',
    keywords: ['layout page break print break'],
    buildCommands: (measureNumber: number): ScoreCommand[] => [{ type: 'setPageBreak', measureNumber }],
    label: 'Page break',
  },
] as const;

function looksLikeCommandChordSymbol(value: string) {
  const compact = value.trim().replace(/\s+/g, '');
  if (!compact) return false;
  const englishRoot = '[A-G](?:#|b)?';
  const germanRoot = '(?:Cis|Ces|Des|Dis|Eis|Ees|Es|Fis|Fes|Gis|Ges|Ais|Aes|As|H)';
  const suffix = '(?:m|maj|min|mal|ma|M|dim|aug|sus|add|alt|o|ø|°|\\+|-|Δ|[0-9(])[A-Za-z0-9#+()./\\-°øΔ]*';
  const bass = `(?:/(?:${englishRoot}|${germanRoot}))?`;
  return new RegExp(`^(?:${germanRoot}|${englishRoot})(?:${suffix})?${bass}$`, 'i').test(compact);
}

type InspectorSectionTarget =
  | 'selection'
  | 'score-setup'
  | 'key'
  | 'repeats-endings'
  | 'time-clef'
  | 'measure'
  | 'text-rehearsal'
  | 'lyrics'
  | 'parts';

type InspectorFocusTarget =
  | 'staff-text'
  | 'rehearsal-mark'
  | 'lyric'
  | 'dynamic'
  | InspectorSectionTarget;
type ScoreViewCommandAction = 'toggle-navigator' | 'focus-find' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'set-view-mode';
type ScoreViewModeCommand = 'page' | 'continuous-vertical' | 'continuous-horizontal';

const SMART_OLLAMA_MODEL_IDS = [
  'nemotron-3-super',
  'nemotron-3-super:cloud',
  'qwen3-coder:480b-cloud',
  'qwen3-coder:480b',
  'gpt-oss:120b-cloud',
  'gemma4:31b-cloud',
  'gemma4:31b',
  'gemma4:12b',
  'mistral-large-3:675b-cloud',
  'ministral-3:14b-cloud',
  'deepseek-v4-flash:cloud',
];

const INPUT_AUDITION_STORAGE_KEY = 'nex-note:input-audition';

function readInputAuditionPreference() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(INPUT_AUDITION_STORAGE_KEY) !== 'false';
}

function pickSmartOllamaModels(models: OllamaModelOption[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  const picked = SMART_OLLAMA_MODEL_IDS
    .map((id) => byId.get(id))
    .filter((model): model is OllamaModelOption => Boolean(model));

  return picked.length > 0 ? picked : models.slice(0, 6);
}

function buildSelectionAnchor(
  selection: {
    entityIds: string[];
    anchorEntityId: string | null;
    anchor: SelectedNote | null;
    selectionCount?: number;
  },
  selectedNotes: SelectedNote[],
): ScoreDocumentSelectionAnchor | null {
  if (!selection.selectionCount) return null;

  return {
    entityIds: selection.entityIds,
    anchorEntityId: selection.anchorEntityId,
    anchorLocator: selection.anchor ? {
      coreMeasureId: selection.anchor.coreMeasureId ?? null,
      corePartId: selection.anchor.corePartId ?? null,
      measureNumber: selection.anchor.measureNumber,
      staffIndex: selection.anchor.staffIndex,
      voiceId: selection.anchor.voiceId,
      timestampNum: selection.anchor.timestampNum,
      timestampDen: selection.anchor.timestampDen,
    } : null,
    selectionLocators: selectedNotes.map((note) => ({
      coreMeasureId: note.coreMeasureId ?? null,
      corePartId: note.corePartId ?? null,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    })),
  };
}

function toSelectedNote(entry: ReturnType<typeof buildSemanticSelectionEntries>[number]): SelectedNote {
  return {
    coreEntityId: entry.coreEntityId,
    coreVoiceId: entry.coreVoiceId,
    coreMeasureId: entry.coreMeasureId,
    corePartId: entry.corePartId,
    measureNumber: entry.measureNumber,
    staffIndex: entry.staffIndex,
    voiceId: entry.voiceId,
    timestampNum: entry.timestampNum,
    timestampDen: entry.timestampDen,
    step: entry.step,
    octave: entry.octave,
    alter: entry.alter,
    isRest: entry.isRest,
    durationType: entry.durationType,
    isDotted: entry.isDotted,
    graphicalNote: null,
  };
}

function resolveSimultaneousNoteSelection(coreDocument: ScoreDocumentModel | null, note: SelectedNote | null) {
  if (!coreDocument || !note || note.isRest) return note ? [note] : [];
  const entries = buildSemanticSelectionEntries(coreDocument)
    .filter((entry) => (
      !entry.isRest
      && entry.measureNumber === note.measureNumber
      && entry.staffIndex === note.staffIndex
      && (!note.coreMeasureId || entry.coreMeasureId === note.coreMeasureId)
      && (!note.corePartId || entry.corePartId === note.corePartId)
      && timestampsEqual(entry.timestampNum, entry.timestampDen, note.timestampNum, note.timestampDen)
    ))
    .map(toSelectedNote);
  return entries.length > 0 ? entries : [note];
}

function isLegacyXmlFilename(name: string) {
  return /\.(xml|musicxml)$/i.test(name);
}

function isMidiFilename(name: string) {
  return /\.(mid|midi)$/i.test(name);
}

function isImageFilename(name: string) {
  return isScoreImageFilename(name);
}

function playbackNoteKey(note: Pick<SelectedNote, 'measureNumber' | 'staffIndex' | 'voiceId' | 'timestampNum' | 'timestampDen'>) {
  return [note.measureNumber, note.staffIndex, note.voiceId, note.timestampNum, note.timestampDen].join(':');
}

function fileFromBase64(payload: ElectronOpenFilePayload) {
  const binary = window.atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], payload.name, { type: payload.type || 'application/octet-stream' });
}

function filesFromElectronOpenPayload(payload: ElectronOpenPayload) {
  return 'files' in payload
    ? payload.files.map(fileFromBase64)
    : [fileFromBase64(payload)];
}

function getElectronOpenPayloadName(payload: ElectronOpenPayload) {
  if ('files' in payload) return payload.name || buildScoreImageBatchBaseName(payload.files);
  return payload.name;
}

function getBrowserImageBatchName(files: File[]) {
  const firstFile = files[0] as (File & { webkitRelativePath?: string }) | undefined;
  const firstPath = firstFile?.webkitRelativePath;
  const folderName = firstPath?.split('/').filter(Boolean).at(-2);
  return folderName || buildScoreImageBatchBaseName(files);
}

function totalFileSize(files: File[]) {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function waitForUiPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function measureXmlBytes(xml: string) {
  if (typeof Blob !== 'undefined') return new Blob([xml]).size;
  return xml.length;
}

function shouldDeferImportPipeline(xml: string) {
  return measureXmlBytes(xml) >= DEFERRED_IMPORT_XML_BYTES;
}

function readChunkedE2EBootPayload() {
  try {
    const rawManifest = localStorage.getItem('nex-note:e2e-boot:manifest');
    if (!rawManifest) return null;
    const manifest = JSON.parse(rawManifest) as { filename?: string; chunks?: number; keyPrefix?: string };
    const chunkCount = Number(manifest.chunks ?? 0);
    const keyPrefix = manifest.keyPrefix || 'nex-note:e2e-boot:chunk:';
    if (!Number.isInteger(chunkCount) || chunkCount <= 0) return null;
    const chunks: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      chunks.push(localStorage.getItem(`${keyPrefix}${index}`) ?? '');
    }
    return {
      xml: chunks.join(''),
      filename: manifest.filename,
      cleanup: () => {
        localStorage.removeItem('nex-note:e2e-boot:manifest');
        for (let index = 0; index < chunkCount; index += 1) {
          localStorage.removeItem(`${keyPrefix}${index}`);
        }
      },
    };
  } catch {
    return null;
  }
}

type EmbedStartupPhase = 'idle' | 'fetching' | 'loading' | 'rendering' | 'ready' | 'error';

interface EmbedStartupState {
  phase: EmbedStartupPhase;
  message: string;
}

type SearchParamRecord = Record<string, string | string[] | undefined>;
type SearchParamInput = URLSearchParams | SearchParamRecord;

interface EmbedConfig {
  enabled: boolean;
  entryId: string;
  dataUrl: string;
  scoreOnly: boolean;
  initialLeftToolsCollapsed: boolean | null;
  initialWorkspaceCollapsed: boolean | null;
}

function truthyQueryFlag(value: string | null) {
  return value === '1' || value === 'true' || value === 'yes';
}

function chromeHiddenQueryFlag(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'none';
}

function queryValue(params: SearchParamInput, name: string) {
  if (params instanceof URLSearchParams) return params.get(name);
  const value = params[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function firstQueryValue(params: SearchParamInput, names: string[]) {
  for (const name of names) {
    const value = queryValue(params, name)?.trim();
    if (value) return value;
  }
  return '';
}

function collapsedQueryValue(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'collapsed', 'closed', 'hidden'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'expanded', 'open', 'visible'].includes(normalized)) return false;
  return null;
}

function firstCollapsedQueryValue(params: SearchParamInput, names: string[]) {
  for (const name of names) {
    const value = collapsedQueryValue(queryValue(params, name));
    if (value !== null) return value;
  }
  return null;
}

function appendEntryToUrl(url: string, entryId: string) {
  if (!entryId || /[?&]entry=/.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}entry=${encodeURIComponent(entryId)}`;
}

function resolveEmbedDataUrl(params: SearchParamInput, entryId: string) {
  const configured = firstQueryValue(params, [
    'scoreDataUrl',
    'scoreDataURL',
    'scoreDataEndpoint',
    'dataUrl',
    'dataURL',
    'dataEndpoint',
    'endpoint',
  ]) || process.env.NEXT_PUBLIC_NEX_NOTE_EMBED_DATA_ENDPOINT?.trim() || '';

  if (configured) {
    const usesEntryTemplate = /\{entry(?:Id)?\}/.test(configured);
    const withEntry = configured
      .replace(/\{entry\}/g, encodeURIComponent(entryId))
      .replace(/\{entryId\}/g, encodeURIComponent(entryId));
    return usesEntryTemplate ? withEntry : appendEntryToUrl(withEntry, entryId);
  }

  if (truthyQueryFlag(queryValue(params, 'jarvisEmbed'))) {
    return `/api/guitar-mentor/knowledge/${encodeURIComponent(entryId)}/nex-note-data/`;
  }

  return appendEntryToUrl('/api/nex-note/score-data', entryId);
}

function readEmbedParams(params: SearchParamInput): EmbedConfig {
  const entryId = firstQueryValue(params, ['entry', 'entryId', 'score', 'scoreId']);
  const enabled = (
    truthyQueryFlag(queryValue(params, 'embed'))
    || truthyQueryFlag(queryValue(params, 'nexNoteEmbed'))
    || truthyQueryFlag(queryValue(params, 'jarvisEmbed'))
    || firstQueryValue(params, ['scoreDataUrl', 'scoreDataURL', 'scoreDataEndpoint', 'dataUrl', 'dataURL', 'dataEndpoint', 'endpoint']).length > 0
  ) && entryId.length > 0;
  return {
    enabled,
    entryId,
    dataUrl: enabled ? resolveEmbedDataUrl(params, entryId) : '',
    scoreOnly: enabled && (
      chromeHiddenQueryFlag(queryValue(params, 'chrome'))
      || truthyQueryFlag(queryValue(params, 'scoreOnly'))
      || firstQueryValue(params, ['view']).toLowerCase() === 'score'
    ),
    initialLeftToolsCollapsed: enabled ? firstCollapsedQueryValue(params, [
      'leftTools',
      'notationTools',
      'leftSidebar',
      'leftToolsCollapsed',
      'notationToolsCollapsed',
    ]) : null,
    initialWorkspaceCollapsed: enabled ? firstCollapsedQueryValue(params, [
      'assistant',
      'workspace',
      'rightWorkspace',
      'workspacePanel',
      'assistantCollapsed',
      'workspaceCollapsed',
    ]) : null,
  };
}

function EmbedStartupScreen({
  phase,
  message,
  children,
}: {
  phase: EmbedStartupPhase;
  message: string;
  children?: ReactNode;
}) {
  const isError = phase === 'error';
  const statusMessage = message || (isError ? 'Could not load embedded score.' : 'Loading embedded score...');

  return (
    <div className="relative flex h-screen min-h-0 w-screen overflow-hidden bg-nex-score-bg" data-testid={isError ? 'embed-error' : 'embed-loading'}>
      {children && (
        <div className="absolute inset-0 opacity-0 pointer-events-none" aria-hidden="true">
          {children}
        </div>
      )}
      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className={`h-1.5 overflow-hidden rounded-full ${isError ? 'bg-red-100' : 'bg-slate-200'}`}>
            <div
              role={isError ? undefined : 'progressbar'}
              aria-label={isError ? undefined : 'Loading embedded score'}
              data-testid={isError ? 'embed-error-bar' : 'embed-loading-bar'}
              className={`h-full rounded-full ${isError ? 'w-full bg-red-500' : 'w-2/3 animate-pulse bg-nex-accent'}`}
            />
          </div>
          <p className={`mt-3 text-center text-sm font-medium ${isError ? 'text-red-700' : 'text-slate-600'}`}>
            {statusMessage}
          </p>
        </div>
      </div>
    </div>
  );
}

interface HomeProps {
  searchParams?: Promise<SearchParamRecord>;
}

export default function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? use(searchParams) : {};
  const { locale, t } = useI18n();
  const embedConfig = useMemo(() => readEmbedParams(resolvedSearchParams), [resolvedSearchParams]);
  const [debugMode, setDebugMode] = useState(false);
  const [isElectronDesktop, setIsElectronDesktop] = useState(false);
  const [filename, setFilename] = useState('');
  const [currentScoreId, setCurrentScoreId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderName | 'benchmark'>('ollama');
  const [ollamaModel, setOllamaModel] = useState('gemma4:31b');
  const [aiModelSettings, setAiModelSettings] = useState<AiModelSettings>(DEFAULT_AI_MODEL_SETTINGS);
  const [aiModelSettingsHydrated, setAiModelSettingsHydrated] = useState(false);
  const [aiSettingsOpenSignal, setAiSettingsOpenSignal] = useState(0);
  const [ollamaConnectionState, setOllamaConnectionState] = useState<AiConnectionState>('checking');
  const [workspaceTab, setWorkspaceTab] = useState<'assistant' | 'library' | 'inspector'>('assistant');
  const initialLeftNotationSidebarCollapsed = embedConfig.enabled
    ? embedConfig.initialLeftToolsCollapsed ?? false
    : true;
  const initialWorkspaceCollapsed = (
    embedConfig.enabled
      ? embedConfig.initialWorkspaceCollapsed ?? embedConfig.scoreOnly
      : true
  );
  const [pencilFocus, setPencilFocus] = useState(false);
  const [pencilInputDevice, setPencilInputDevice] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      setPencilFocus(true);
      setPencilInputDevice(true);
    }
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => initialWorkspaceCollapsed);
  const [leftNotationSidebarCollapsed, setLeftNotationSidebarCollapsed] = useState(() => initialLeftNotationSidebarCollapsed);
  const [leftNotationSidebarHydrated, setLeftNotationSidebarHydrated] = useState(false);
  const skipNextLeftNotationSidebarPersistRef = useRef(false);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [layoutCleanupLoading, setLayoutCleanupLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [scoreOpenStatus, setScoreOpenStatus] = useState('');
  const [embedStartup, setEmbedStartup] = useState<EmbedStartupState>({ phase: 'idle', message: '' });
  const [nativeProjectCacheEnabled, setNativeProjectCacheEnabled] = useState(false);
  const [inputAuditionEnabled, setInputAuditionEnabled] = useState(readInputAuditionPreference);
  const [nxnProjectDirectoryLabel, setNxnProjectDirectoryLabel] = useState('');
  const [printView, setPrintView] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [pendingPdfExport, setPendingPdfExport] = useState(false);
  const [printReadyXml, setPrintReadyXml] = useState<string | null>(null);
  const [newScoreDialogOpen, setNewScoreDialogOpen] = useState(false);
  const [newScoreInitialTab, setNewScoreInitialTab] = useState<DialogTab>('instruments');
  const [userTemplates, setUserTemplates] = useState<UserScoreTemplate[]>([]);
  const [userTemplateStatus, setUserTemplateStatus] = useState('');
  const [pendingAutoNoteInput, setPendingAutoNoteInput] = useState(false);
  const [bugReportDialogOpen, setBugReportDialogOpen] = useState(false);
  const [bugReportDirectoryLabel, setBugReportDirectoryLabel] = useState('Browser download fallback');
  const [transposeMode, setTransposeMode] = useState<DragTransposeMode>('chromatic');
  const [scoreSessionRevision, setScoreSessionRevision] = useState<number | null>(null);
  const [chatTranscript, setChatTranscript] = useState<BugReportChatMessage[]>([]);
  const [importLifecycle, setImportLifecycle] = useState<ImportLifecycleState>({
    phase: 'idle',
    xml: '',
    filename: '',
    deferred: false,
    startedAt: 0,
    osmdRenderedAt: null,
  });

  useEffect(() => {
    window.localStorage.setItem(INPUT_AUDITION_STORAGE_KEY, String(inputAuditionEnabled));
  }, [inputAuditionEnabled]);
  const {
    xml, sourceMusicXml, coreDocument, diagnostics, session, updateSession, loadXml, hydrateCurrentXml, loadFromNxn, replaceXml, applyCommands, undo, redo, reset,
    canUndo, canRedo, lastCommands, historyMeta,
  } = useScoreDocument('');

  // Single benchmark
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  useEffect(() => {
    setDebugMode(isDebugEnabled());
    setIsElectronDesktop(Boolean(getNexNoteElectronApi()?.isElectron));
  }, []);

  useEffect(() => {
    const electronApi = getNexNoteElectronApi();
    if (!electronApi?.listUserTemplates) {
      setUserTemplateStatus('Local App Support templates are available in the Mac app. Use Import user template file in the browser.');
      return;
    }

    let cancelled = false;
    electronApi.listUserTemplates()
      .then((folders) => {
        if (cancelled) return;
        const nextTemplates = dedupeUserTemplates(folders.flatMap((folder) => normalizeUserTemplatesFromFolder(folder)));
        const contentByKey = new Map<string, string>();
        for (const folder of folders) {
          for (const file of folder.files) {
            const key = `${file.sourceLabel ?? folder.sourceLabel ?? ''}:${file.filename}`;
            contentByKey.set(key, file.content);
          }
        }
        userTemplateContentRef.current = contentByKey;
        setUserTemplates(nextTemplates);
        setUserTemplateStatus(nextTemplates.length > 0
          ? `${nextTemplates.length} local template${nextTemplates.length === 1 ? '' : 's'} loaded from App Support.`
          : 'No local App Support templates found. Use Import user template file to choose one manually.');
      })
      .catch((error) => {
        if (cancelled) return;
        setUserTemplates([]);
        userTemplateContentRef.current = new Map();
        setUserTemplateStatus(`Could not load local templates: ${error instanceof Error ? error.message : String(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (embedConfig.initialLeftToolsCollapsed !== null) {
      skipNextLeftNotationSidebarPersistRef.current = true;
      setLeftNotationSidebarCollapsed(embedConfig.initialLeftToolsCollapsed);
    } else {
      setLeftNotationSidebarCollapsed(initialLeftNotationSidebarCollapsed);
    }
    setLeftNotationSidebarHydrated(true);
  }, []);

  useEffect(() => {
    if (!leftNotationSidebarHydrated) return;
    if (skipNextLeftNotationSidebarPersistRef.current) {
      skipNextLeftNotationSidebarPersistRef.current = false;
      return;
    }
    writeLeftNotationSidebarCollapsed(leftNotationSidebarCollapsed);
  }, [leftNotationSidebarCollapsed, leftNotationSidebarHydrated]);

  useEffect(() => {
    if (!document.documentElement.classList.contains('nex-note-native')) return;

    const narrowIpad = window.matchMedia('(max-width: 900px)');
    const collapseForNarrowIpad = () => {
      if (!narrowIpad.matches) return;
      setLeftNotationSidebarCollapsed(true);
      setSidebarCollapsed(true);
    };

    collapseForNarrowIpad();
    narrowIpad.addEventListener('change', collapseForNarrowIpad);
    return () => narrowIpad.removeEventListener('change', collapseForNarrowIpad);
  }, [Boolean(xml)]);

  const [benchmarkPrompt, setBenchmarkPrompt] = useState('');

  // Provider suite
  const [suiteRunning, setSuiteRunning] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState({ current: 0, total: 0, currentLabel: '' });
  const [suiteResults, setSuiteResults] = useState<SuiteResult[]>([]);

  const [lastOperations, setLastOperations] = useState<unknown[]>([]);
  const [selectedMeasureNumbers, setSelectedMeasureNumbers] = useState<number[]>([]);
  const [clearMeasureSelectionSignal, setClearMeasureSelectionSignal] = useState(0);
  const handleMeasureSelectionChange = useCallback(
    (selection: { measureIds: string[]; measureNumbers: number[] }) => {
      setSelectedMeasureNumbers(selection.measureNumbers);
    },
    []
  );

  // Ollama model comparison suite
  const [ollamaSuiteRunning, setOllamaSuiteRunning] = useState(false);
  const [ollamaSuiteProgress, setOllamaSuiteProgress] = useState({ current: 0, total: 0, currentLabel: '' });
  const [ollamaSuiteRows, setOllamaSuiteRows] = useState<OllamaSuiteRow[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>(OLLAMA_MODELS);
  const [ollamaSuiteMode, setOllamaSuiteMode] = useState<'smart' | 'all'>('smart');
  const e2eBootRef = useRef(false);
  const embedBootAttemptedRef = useRef(false);
  const nxnProjectDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const userTemplateContentRef = useRef(new Map<string, string>());

  // OSMD ref for the editor — stable callback so ScoreEditor's useEffect never re-fires
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackSelectedNoteRef = useRef<SelectedNote | null>(null);
  const smartOllamaModels = useMemo(() => pickSmartOllamaModels(ollamaModels), [ollamaModels]);
  const aiProviderRequestSettings = useMemo(() => buildAiProviderRequestSettings(aiModelSettings), [aiModelSettings]);
  const providerOptions = useMemo<Array<ProviderName | 'benchmark'>>(() => {
    const enabled = AI_PROVIDER_ORDER.filter((providerId) => aiModelSettings.providers[providerId].enabled);
    return [...(enabled.length ? enabled : ['ollama' as ProviderName]), 'benchmark'];
  }, [aiModelSettings]);

  const handleAiModelSettingsChange = useCallback((nextSettings: AiModelSettings) => {
    setAiModelSettings(normalizeAiModelSettings(nextSettings));
  }, []);

  const handleOllamaModelsChange = useCallback((models: OllamaModelOption[]) => {
    setOllamaModels(models);
    setAiModelSettings((current) => normalizeAiModelSettings({
      ...current,
      providers: {
        ...current.providers,
        ollama: {
          ...current.providers.ollama,
          models,
        },
      },
    }));
  }, []);

  const handleOllamaModelChange = useCallback((model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    setOllamaModel(trimmed);
    setAiModelSettings((current) => {
      const existingModels = current.providers.ollama.models;
      const models = existingModels.some((option) => option.id === trimmed)
        ? existingModels
        : mergeModelOptions(existingModels, [{ id: trimmed, label: trimmed }]);
      return normalizeAiModelSettings({
        ...current,
        providers: {
          ...current.providers,
          ollama: {
            ...current.providers.ollama,
            selectedModel: trimmed,
            models,
          },
        },
      });
    });
  }, []);

  useEffect(() => {
    const storedSettings = readAiModelSettings();
    setAiModelSettings(storedSettings);
    setOllamaModels(storedSettings.providers.ollama.models);
    setOllamaModel(storedSettings.providers.ollama.selectedModel);
    setAiModelSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!aiModelSettingsHydrated) return;
    writeAiModelSettings(aiModelSettings);
  }, [aiModelSettings, aiModelSettingsHydrated]);

  useEffect(() => {
    if (provider === 'benchmark') return;
    if (aiModelSettings.providers[provider].enabled) return;
    const nextProvider = AI_PROVIDER_ORDER.find((providerId) => aiModelSettings.providers[providerId].enabled) ?? 'ollama';
    setProvider(nextProvider);
  }, [aiModelSettings, provider]);

  useEffect(() => {
    if (!aiModelSettingsHydrated) return;
    setOllamaConnectionState('checking');
    fetch('/api/ollama-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiSettings: aiProviderRequestSettings }),
    })
      .then((res) => res.json())
      .then((data) => {
        setOllamaConnectionState(
          data.source === 'live' || data.source === 'live+cloud' || data.source === 'cloud'
            ? 'connected'
            : 'offline',
        );
        if (Array.isArray(data.models) && data.models.length > 0) {
          const mergedModels = mergeModelOptions(aiModelSettings.providers.ollama.models, data.models);
          const currentModelIds = aiModelSettings.providers.ollama.models.map((model) => model.id).join('\n');
          const mergedModelIds = mergedModels.map((model) => model.id).join('\n');
          if (currentModelIds !== mergedModelIds) {
            handleOllamaModelsChange(mergedModels);
          }
          if (!mergedModels.some((model: { id: string }) => model.id === ollamaModel)) {
            handleOllamaModelChange(mergedModels[0].id);
          }
        }
      })
      .catch(() => {
        setOllamaConnectionState('offline');
        /* keep fallback model list */
      });
  }, [aiModelSettings.providers.ollama.models, aiModelSettingsHydrated, aiProviderRequestSettings, handleOllamaModelChange, handleOllamaModelsChange, ollamaModel]);

  useEffect(() => {
    if (!supportsNxnProjectDirectoryStorage()) return;
    void getSavedNxnProjectDirectoryHandle()
      .then(async (handle) => {
        if (!handle) return;
        nxnProjectDirectoryRef.current = handle;
        setNxnProjectDirectoryLabel(formatNxnProjectDirectoryLabel(handle));
        setNativeProjectCacheEnabled(true);
      })
      .catch(() => {
        nxnProjectDirectoryRef.current = null;
        setNxnProjectDirectoryLabel('');
      });
  }, []);

  const getImportProjectDirectory = useCallback(async () => {
    if (!supportsNxnProjectDirectoryStorage()) return null;

    let handle: FileSystemDirectoryHandle | null = null;
    try {
      handle = nxnProjectDirectoryRef.current ?? await getSavedNxnProjectDirectoryHandle();
      if (!handle) return null;
      if (!(await hasNxnProjectDirectoryPermission(handle))) return null;
    } catch {
      nxnProjectDirectoryRef.current = null;
      setNxnProjectDirectoryLabel('');
      return null;
    }

    nxnProjectDirectoryRef.current = handle;
    setNxnProjectDirectoryLabel(formatNxnProjectDirectoryLabel(handle));
    setNativeProjectCacheEnabled(true);
    return handle;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleOsmdReady = useCallback((osmd: any) => {
    osmdRef.current = osmd;
    setOsmd(osmd);
    setScoreOpenStatus('');
    setImportLifecycle((current) => (
      current.xml
        ? { ...current, phase: 'osmdRendered', osmdRenderedAt: performance.now() }
        : current
    ));
    void waitForUiPaint().then(() => {
      setImportLifecycle((current) => (
        current.phase === 'osmdRendered'
          ? { ...current, phase: 'debugGridReady' }
          : current
      ));
    });
    setEmbedStartup((current) => (
      current.phase === 'rendering' || current.phase === 'loading' || current.phase === 'fetching'
        ? { phase: 'ready', message: '' }
        : current
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Playback
  const activeSampleTemplate = useMemo(
    () => findUserTemplateForSamplePlayback(userTemplates, coreDocument),
    [coreDocument, userTemplates],
  );
  const playbackSampleBank = useMemo<PlaybackSampleBank | null>(() => {
    const sampleBank = activeSampleTemplate?.sampleBank;
    const sourceLabel = activeSampleTemplate?.sourceLabel;
    const electronApi = getNexNoteElectronApi();
    if (!sampleBank || !sourceLabel || !electronApi?.readUserTemplateSample) return null;
    return {
      ...sampleBank,
      id: `${sourceLabel}:${activeSampleTemplate.id}:${sampleBank.directory}`,
      async loadSample(filename) {
        const data = await electronApi.readUserTemplateSample({
          sourceLabel,
          directory: sampleBank.directory,
          filename,
        });
        if (data instanceof ArrayBuffer) return data;
        if (ArrayBuffer.isView(data)) {
          return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        }
        throw new TypeError(`Local template sample "${filename}" did not contain audio data.`);
      },
    };
  }, [activeSampleTemplate]);
  const {
    playbackState, currentMeasure, currentBeat, totalBeats, midiLoading,
    ensureMidiLoaded, preloadMidi, prewarm, play, pause, stop, seek, seekToCursorTarget, startFromNote, previewNote, previewNotes, setTempo, tempoOverride, hasMidi, playbackError, playbackCursorTarget, playhead,
    metronomeEnabled, setMetronomeEnabled, setMixer,
  } = usePlayback({ coreDocument, selectedNoteRef: playbackSelectedNoteRef, selectedMeasureNumbers, sampleBank: playbackSampleBank });

  const markMidiReady = useCallback((loadedXml: string) => {
    setImportLifecycle((current) => current.xml === loadedXml
      ? { ...current, phase: 'midiReady' }
      : current
    );
  }, []);

  // Note editor
  const {
    selection, noteInputAnchor, selectedNote, selectedNotes, clipboardCount, noteInputMode, selectedDuration, selectedAccidental,
    isDotted, selectedVoice, entryMode, chordInputMode, stepInputKeyboardMode, inputByDurationMode, preparedDurationPitchLabel, preparedDurationActivePitch, leadsheetMode, guitarInputMode, selectedGuitarString, selectedGuitarFret, selectedGuitarTuning, guitarFretBuffer,
    editorError,
    toggleNoteInput, toggleEntryMode, toggleChordInputMode, toggleStepInputKeyboardMode, toggleInputByDurationMode, toggleLeadsheetMode, toggleGuitarInputMode, handleNoteClick, handleKeyDown, setDuration, setAccidental,
    toggleDotted, setVoice, insertRest, insertSlash, insertGuitarFret, setGuitarFretAtNote, setGuitarTuning, toggleGuitarTechnique, fillSlashMeasure, setHarmonyAtSelection, deleteSelectedNote, duplicateSelection, copySelection, cutSelection, pasteClipboard, clearSelection, restoreSelection, setOsmd,
    changePitch, prepareInputByDurationPitch, prepareInputByDurationRest, changeInputByDurationOctave, replaceSelectedPitchAndAdvance, changeOctave, insertNote, insertMidiChord, toggleArticulation, setAccidentalDisplay, clearArticulations, addDynamic, toggleTie, toggleSlur,
    transposeSemitones, commitDraggedPitch, commitDraggedGuitarString, setBarline, addGraceNoteAtSelection, addTupletToSelection, addIntervalAbove, placeNoteAt,
  } = useNoteEditor(
    xml,
    coreDocument,
    (commands, meta) => applyCommands(commands, { selectionAnchor: meta?.selectionAnchor ?? null, prepared: meta?.prepared }),
    {
      onNoteInputActivated: () => {
        // Initialize audio in the mode-activation gesture, before a note click
        // needs to commit and paint. Prewarming never starts a note.
        if (inputAuditionEnabled) void prewarm().catch(() => undefined);
      },
      onActiveNotePreview: (note) => {
        if (inputAuditionEnabled && note && !note.isRest) void previewNote(note);
      },
      onActiveNotesPreview: (notes) => {
        if (inputAuditionEnabled) void previewNotes(notes);
      },
      hydratedSession: {
        selectedDuration: session.selectedDuration,
        selectedVoice: Math.max(1, Math.min(4, session.selectedVoice)) as 1 | 2 | 3 | 4,
      },
    },
  );

  const activePlaybackNote = noteInputAnchor ?? selectedNote;
  const activePlaybackNoteRef = useRef(activePlaybackNote);
  activePlaybackNoteRef.current = activePlaybackNote;
  const playbackStartNoteKeyRef = useRef<string | null>(null);

  const preferFlatsForMidiInput = useMemo(() => {
    if (!coreDocument || !activePlaybackNote) return false;
    const part = coreDocument.score.parts.find((entry) => entry.id === activePlaybackNote.corePartId)
      ?? coreDocument.score.parts.find((entry) => entry.staves.some((staff) => (
        staff.staffIndex === activePlaybackNote.staffIndex
        && staff.measures.some((measure) => measure.measureNumber === activePlaybackNote.measureNumber)
      )));
    const staff = part?.staves.find((entry) => entry.staffIndex === activePlaybackNote.staffIndex);
    let keyFifths = 0;
    for (const measure of staff?.measures ?? []) {
      if (measure.measureNumber > activePlaybackNote.measureNumber) break;
      for (const attributes of measure.attributes) {
        if (attributes.keyFifths != null) keyFifths = attributes.keyFifths;
      }
    }
    return preferFlatsForKeySignature(keyFifths);
  }, [activePlaybackNote, coreDocument]);

  const midiRecording = useMidiRecording(noteInputMode, selectedNote, coreDocument);
  const handleMidiChord = useCallback((pitches: Parameters<typeof insertMidiChord>[0]) => {
    // CoreMIDI may deliver several attacks in one JavaScript task. Publish each
    // transaction and its cursor before interpreting the next physical onset.
    flushSync(() => { insertMidiChord(pitches); });
  }, [insertMidiChord]);

  const {
    enabled: midiInputEnabled,
    status: midiInputStatus,
    deviceNames: midiInputDevices,
    devices: midiDevices,
    selectedDeviceId: midiSelectedDeviceId,
    selectDevice: selectMidiDevice,
    toggle: toggleMidiInput,
  } = useMidiInput({
    onChord: handleMidiChord,
    active: noteInputMode,
    onMessage: midiRecording.onMessage,
    onReset: midiRecording.cancel,
    preferFlats: preferFlatsForMidiInput,
  });

  useEffect(() => {
    if (midiInputStatus !== 'connected') midiRecording.cancel();
  }, [midiInputStatus, midiRecording.cancel]);

  const handleMicrophonePitches = useCallback((
    pitches: Parameters<typeof insertMidiChord>[0],
    mode: MicrophoneDetectionMode,
  ) => {
    if (mode === 'chord') {
      insertMidiChord(pitches, {
        addToMatchingChord: true,
        insertAtCursor: true,
        advanceCursor: false,
      });
      return;
    }
    insertMidiChord(pitches, { advanceCursor: true });
  }, [insertMidiChord]);

  const {
    enabled: microphoneInputEnabled,
    status: microphoneInputStatus,
    detectedPitchLabel: microphoneDetectedPitchLabel,
    detectedSoundingPitchLabel: microphoneDetectedSoundingPitchLabel,
    signalLevelDb: microphoneSignalLevelDb,
    signalQuality: microphoneSignalQuality,
    inputDevices: microphoneInputDevices,
    selectedDeviceId: microphoneSelectedDeviceId,
    detectionMode: microphoneDetectionMode,
    instrumentMode: microphoneInstrumentMode,
    toggle: toggleMicrophoneInput,
    selectDevice: selectMicrophoneInput,
    selectDetectionMode: selectMicrophoneDetectionMode,
    selectInstrumentMode: selectMicrophoneInstrumentMode,
  } = useMicrophonePitchInput({
    onChord: handleMicrophonePitches,
    preferFlats: preferFlatsForMidiInput,
  });

  const prepareInstrumentRecordMode = useCallback(() => {
    // Instrument Record has one deliberately narrow keyboard contract:
    // 1-9 select the duration, then the next detected note/chord commits it.
    // Disable modes that otherwise consume those digits or defer the commit.
    if (inputByDurationMode) toggleInputByDurationMode();
    if (stepInputKeyboardMode) toggleStepInputKeyboardMode();
    if (guitarInputMode) toggleGuitarInputMode();
    if (!noteInputMode) toggleNoteInput();
  }, [
    guitarInputMode,
    inputByDurationMode,
    noteInputMode,
    stepInputKeyboardMode,
    toggleGuitarInputMode,
    toggleInputByDurationMode,
    toggleNoteInput,
    toggleStepInputKeyboardMode,
  ]);

  const handleToggleMidiInput = useCallback(() => {
    if (!midiInputEnabled) prepareInstrumentRecordMode();
    void toggleMidiInput();
  }, [midiInputEnabled, prepareInstrumentRecordMode, toggleMidiInput]);

  const handleToggleMicrophoneInput = useCallback(() => {
    if (!microphoneInputEnabled) prepareInstrumentRecordMode();
    void toggleMicrophoneInput();
  }, [microphoneInputEnabled, prepareInstrumentRecordMode, toggleMicrophoneInput]);

  useLayoutEffect(() => {
    playbackSelectedNoteRef.current = activePlaybackNote;
  }, [activePlaybackNote]);

  const currentSelectionAnchor = useMemo(
    () => buildSelectionAnchor(selection, selectedNotes),
    [selectedNotes, selection],
  );

  useEffect(() => {
    const shouldRestoreEmptySelection = ['undo', 'redo', 'load', 'reset', 'replace'].includes(historyMeta.lastAction ?? '');
    if (historyMeta.currentSelectionAnchor == null && !shouldRestoreEmptySelection) return;
    restoreSelection(historyMeta.currentSelectionAnchor ?? null);
  }, [historyMeta.currentSelectionAnchor, historyMeta.lastAction, historyMeta.lastTransaction?.id, restoreSelection]);

  useEffect(() => {
    updateSession({
      selectionAnchor: currentSelectionAnchor,
      selectedDuration,
      selectedVoice,
    });
  }, [currentSelectionAnchor, selectedDuration, selectedVoice, updateSession]);

  useEffect(() => {
    if (selectedMeasureNumbers.length === 0) return;
    if (!xml) {
      setSelectedMeasureNumbers([]);
      return;
    }
  }, [selectedMeasureNumbers.length, xml]);

  const clearSelectedMeasures = useCallback(() => {
    if (!coreDocument || selectedMeasureNumbers.length === 0) return false;

    const targetMeasures = new Set(selectedMeasureNumbers);
    const commands = coreDocument.score.parts.flatMap((part) => part.staves.flatMap((staff) => (
      staff.measures
        .filter((measure) => targetMeasures.has(measure.measureNumber))
        .flatMap((measure) => measure.voices.flatMap((voice) => voice.events.map((event) => ({
          type: 'deleteNote' as const,
          measureNumber: event.measureNumber,
          staffIndex: event.staffIndex,
          voiceId: event.voiceId,
          timestampNum: event.timestampNum,
          timestampDen: event.timestampDen,
        }))))
    )));

    if (commands.length === 0) return false;

    applyCommands(commands, { label: 'Clear selected measures', selectionAnchor: null });
    clearSelection();
    setSelectedMeasureNumbers([]);
    setClearMeasureSelectionSignal((value) => value + 1);
    return true;
  }, [applyCommands, clearSelection, coreDocument, selectedMeasureNumbers]);

  const handleDeleteSelection = useCallback(() => {
    if (clearSelectedMeasures()) return;
    deleteSelectedNote();
  }, [clearSelectedMeasures, deleteSelectedNote]);

  const selectedBarlineMeasureNumber = selectedMeasureNumbers[selectedMeasureNumbers.length - 1] ?? null;
  const setBarlineAtSelection = useCallback((barline: BarlineKind) => {
    setBarline(barline, selectedBarlineMeasureNumber);
  }, [selectedBarlineMeasureNumber, setBarline]);

  useEffect(() => {
    if (commandCenterOpen || newScoreDialogOpen || bugReportDialogOpen) return;
    if (typeof document === 'undefined') return;
    const shell = document.querySelector('.nex-app-shell');
    if (!shell) return;

    Array.from(shell.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      if (child.hasAttribute('data-command-center-inerted')) return;
      if (!child.hasAttribute('inert') || child.getAttribute('aria-hidden') !== 'true') return;
      child.inert = false;
      child.removeAttribute('aria-hidden');
    });
  }, [bugReportDialogOpen, commandCenterOpen, newScoreDialogOpen]);

  useEffect(() => {
    if (embedConfig.enabled || !xml || playbackState !== 'stopped' || noteInputMode) return;
    if (importLifecycle.deferred && !['debugGridReady', 'midiReady'].includes(importLifecycle.phase)) return;
    let idleCallback: number | null = null;
    let cancelled = false;
    const cancelForInteraction = () => {
      cancelled = true;
      if (idleCallback !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallback);
      }
    };
    const preload = () => {
      if (cancelled) return;
      void preloadMidi(xml).then((ready) => {
        if (ready && !cancelled) markMidiReady(xml);
      });
    };
    const timeout = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleCallback = window.requestIdleCallback(preload, { timeout: 2_000 });
      } else {
        preload();
      }
    }, 1_200);
    window.addEventListener('pointerdown', cancelForInteraction, { once: true, passive: true });
    window.addEventListener('keydown', cancelForInteraction, { once: true });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (idleCallback !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallback);
      }
      window.removeEventListener('pointerdown', cancelForInteraction);
      window.removeEventListener('keydown', cancelForInteraction);
    };
  }, [embedConfig.enabled, importLifecycle.deferred, importLifecycle.phase, markMidiReady, noteInputMode, playbackState, preloadMidi, xml]);

  const focusInspectorTarget = useCallback((target: InspectorFocusTarget) => {
    setSidebarCollapsed(false);
    setWorkspaceTab('inspector');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('nex-note:focus-inspector-field', { detail: { target } }));
    }, 0);
  }, []);

  const focusEditPaletteSection = useCallback((section: EditPaletteSectionId) => {
    setPrintView(false);
    setLeftNotationSidebarCollapsed(false);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('nex-note:focus-edit-palette-section', { detail: { section } }));
    }, 0);
  }, []);

  const dispatchScoreViewCommand = useCallback((action: ScoreViewCommandAction, viewMode?: ScoreViewModeCommand) => {
    window.dispatchEvent(new CustomEvent('nex-note:score-view-command', { detail: { action, viewMode } }));
  }, []);

  // Global keyboard handler for note editing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const metaKey = e.metaKey || e.ctrlKey;
      const normalizedKey = e.key.toLowerCase();
      const isKeyZ = normalizedKey === 'z' || e.code === 'KeyZ';
      const isKeyY = normalizedKey === 'y' || e.code === 'KeyY';
      const isKeyK = normalizedKey === 'k' || e.code === 'KeyK';
      const isKeyT = normalizedKey === 't' || e.code === 'KeyT';
      const isKeyM = normalizedKey === 'm' || e.code === 'KeyM';
      const isKeyC = normalizedKey === 'c' || e.code === 'KeyC';
      const target = e.target as HTMLElement | null;
      const isTextEntry = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || Boolean(target?.isContentEditable);
      if (
        microphoneInputEnabled
        && e.altKey
        && !metaKey
        && !e.shiftKey
        && isKeyC
        && !isTextEntry
      ) {
        e.preventDefault();
        e.stopPropagation();
        selectMicrophoneDetectionMode(
          microphoneDetectionMode === 'single' ? 'chord' : 'single',
        );
        return;
      }
      if (metaKey && isKeyK) {
        e.preventDefault();
        e.stopPropagation();
        if (xml && selectedNote && !e.shiftKey && !e.altKey) {
          setCommandCenterOpen(false);
          window.dispatchEvent(new CustomEvent('nex-note:focus-inline-chord-symbol'));
          recordBugReportEvent('workspace', 'focus-inline-chord-symbol', {
            source: 'keyboard',
          });
        } else {
          setCommandCenterOpen(true);
          recordBugReportEvent('workspace', 'open-command-center', {
            source: 'keyboard',
          });
        }
        return;
      }
      if (xml && metaKey && !e.shiftKey && !e.altKey && isKeyT) {
        e.preventDefault();
        e.stopPropagation();
        focusInspectorTarget('staff-text');
        recordBugReportEvent('workspace', 'focus-inspector-text', {
          source: 'keyboard',
          target: 'staff-text',
        });
        return;
      }
      if (xml && metaKey && !e.shiftKey && !e.altKey && isKeyM) {
        e.preventDefault();
        e.stopPropagation();
        focusInspectorTarget('rehearsal-mark');
        recordBugReportEvent('workspace', 'focus-inspector-text', {
          source: 'keyboard',
          target: 'rehearsal-mark',
        });
        return;
      }
      if (!getNexNoteElectronApi() && !isTextEntry && metaKey && isKeyZ && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        recordBugReportEvent('commands', 'undo');
        undo();
        return;
      }
      if (!getNexNoteElectronApi() && !isTextEntry && metaKey && (isKeyY || (isKeyZ && e.shiftKey))) {
        e.preventDefault();
        e.stopPropagation();
        recordBugReportEvent('commands', 'redo');
        redo();
        return;
      }
      if (e.key === ' ' && !isTextEntry) {
        e.preventDefault();
        if (e.repeat) return;
        if (playbackState === 'playing') pause();
        else {
          if (!xml) return;
          // Start at the active note when playback is stopped, or when the selection moved since the
          // playback started (e.g. arrow-key navigation while paused); otherwise resume where paused.
          const startNote = activePlaybackNoteRef.current;
          const startKey = playbackStartNoteKeyRef.current;
          const noteKey = startNote ? playbackNoteKey(startNote) : null;
          const fromNote = startNote && (playbackState === 'stopped' || noteKey !== startKey) ? startNote : null;
          void (async () => {
            const [ready] = await Promise.all([
              ensureMidiLoaded(xml),
              prewarm(),
            ]);
            if (!ready) return;
            markMidiReady(xml);
            playbackStartNoteKeyRef.current = noteKey;
            if (fromNote) await startFromNote(fromNote);
            else await play();
          })();
        }
        return;
      }
      handleKeyDown(e);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [
    ensureMidiLoaded,
    focusInspectorTarget,
    handleKeyDown,
    markMidiReady,
    microphoneDetectionMode,
    microphoneInputEnabled,
    pause,
    play,
    playbackState,
    prewarm,
    redo,
    selectMicrophoneDetectionMode,
    startFromNote,
    undo,
    xml,
  ]);

  const handleXmlFileLoaded = useCallback((newXml: string, name: string, options: { cacheNativeProject?: boolean } = {}) => {
    const deferred = shouldDeferImportPipeline(newXml);
    const startedAt = performance.now();
    setImportLifecycle({
      phase: 'received',
      xml: newXml,
      filename: name,
      deferred,
      startedAt,
      osmdRenderedAt: null,
    });
    setScoreOpenStatus(`${t('library.rendering')} score…`);
    setNativeProjectCacheEnabled(Boolean(options.cacheNativeProject));
    setLeftNotationSidebarCollapsed(initialLeftNotationSidebarCollapsed);
    setSidebarCollapsed(initialWorkspaceCollapsed);
    const saved = saveLibraryScore({
      name,
      xml: newXml,
      nativeProject: options.cacheNativeProject ? undefined : null,
      nativeName: options.cacheNativeProject ? buildNxnFilename(name) : null,
      format: name.split('.').pop()?.toLowerCase(),
      persistXml: !deferred,
    });
    loadXml(newXml, { deferCoreHydration: deferred });
    setImportLifecycle((current) => current.xml === newXml
      ? { ...current, phase: deferred ? 'parsedXml' : 'coreBuilt' }
      : current
    );
    if (deferred) {
      void waitForUiPaint().then(() => {
        if (!hydrateCurrentXml(newXml)) return;
        setImportLifecycle((current) => current.xml === newXml
          ? { ...current, phase: 'coreBuilt' }
          : current
        );
      });
    }
    setFilename(name);
    setCurrentScoreId(saved.id);
    setBenchmarkResults([]);
    setSuiteResults([]);
    setLastOperations([]);
    stop();
    recordBugReportEvent('workspace', 'file-loaded', {
      filename: name,
      scoreId: saved.id,
      measures: (newXml.match(/<measure\b/g) ?? []).length,
      format: 'xml',
    });
    return saved;
  }, [hydrateCurrentXml, initialLeftNotationSidebarCollapsed, initialWorkspaceCollapsed, loadXml, stop, t]);

  const handleEmbeddedXmlLoaded = useCallback((newXml: string, name: string) => {
    const deferred = shouldDeferImportPipeline(newXml);
    const startedAt = performance.now();
    setImportLifecycle({
      phase: 'received',
      xml: newXml,
      filename: name,
      deferred,
      startedAt,
      osmdRenderedAt: null,
    });
    setNativeProjectCacheEnabled(false);
    loadXml(newXml, { deferCoreHydration: deferred });
    setImportLifecycle((current) => current.xml === newXml
      ? { ...current, phase: deferred ? 'parsedXml' : 'coreBuilt' }
      : current
    );
    if (deferred) {
      void waitForUiPaint().then(() => {
        if (!hydrateCurrentXml(newXml)) return;
        setImportLifecycle((current) => current.xml === newXml
          ? { ...current, phase: 'coreBuilt' }
          : current
        );
      });
    }
    setFilename(name);
    setCurrentScoreId(null);
    setBenchmarkResults([]);
    setSuiteResults([]);
    setLastOperations([]);
    stop();
    recordBugReportEvent('workspace', 'embed-loaded', {
      filename: name,
      entryId: embedConfig.entryId,
      measures: (newXml.match(/<measure\b/g) ?? []).length,
      format: 'xml',
    });
  }, [embedConfig.entryId, hydrateCurrentXml, loadXml, stop]);

  useEffect(() => {
    const target = window as typeof window & {
      __NEX_NOTE_E2E_LOAD_XML__?: (nextXml: string, nextFilename?: string) => void;
    };
    target.__NEX_NOTE_E2E_LOAD_XML__ = (nextXml, nextFilename = 'score.musicxml') => {
      handleXmlFileLoaded(nextXml, nextFilename);
    };
    return () => {
      delete target.__NEX_NOTE_E2E_LOAD_XML__;
    };
  }, [handleXmlFileLoaded]);

  useEffect(() => {
    if (!embedConfig.enabled || embedBootAttemptedRef.current || e2eBootRef.current || xml) return;

    let cancelled = false;
    embedBootAttemptedRef.current = true;

    async function bootEmbed() {
      setEmbedStartup({ phase: 'fetching', message: 'Loading embedded score...' });
      try {
        const response = await fetch(embedConfig.dataUrl, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success || typeof data.xml !== 'string' || !data.xml.trim()) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Embedded score data did not include MusicXML.');
        }
        if (cancelled) return;
        e2eBootRef.current = true;
        const embeddedFilename = typeof data.filename === 'string' && data.filename.trim()
          ? data.filename.trim()
          : typeof data.title === 'string' && data.title.trim()
            ? `${data.title.trim()}.musicxml`
            : `${embedConfig.entryId || 'embedded-score'}.musicxml`;
        setEmbedStartup({ phase: 'loading', message: 'Loading MusicXML into the editor...' });
        handleEmbeddedXmlLoaded(data.xml, embeddedFilename);
        setEmbedStartup({ phase: 'rendering', message: 'Rendering embedded score...' });
      } catch (error) {
        if (!cancelled) {
          setEmbedStartup({
            phase: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    void bootEmbed();
    return () => {
      cancelled = true;
    };
  }, [embedConfig.dataUrl, embedConfig.enabled, embedConfig.entryId, handleEmbeddedXmlLoaded, xml]);

  const handleNxnFileLoaded = useCallback((fileData: Awaited<ReturnType<typeof readNxnFile>>, name: string, options: { cacheNativeProject?: boolean } = {}) => {
    setScoreOpenStatus(`${t('library.rendering')} score…`);
    const nativeName = buildNxnFilename(name);
    const saved = saveLibraryScore({
      name: nativeName,
      xml: fileData.sourceMusicXml,
      nativeProject: options.cacheNativeProject ? fileData : null,
      nativeName: options.cacheNativeProject ? nativeName : null,
      format: 'nxn',
    });
    setNativeProjectCacheEnabled(Boolean(options.cacheNativeProject));
    loadFromNxn(fileData);
    setFilename(nativeName);
    setCurrentScoreId(saved.id);
    setBenchmarkResults([]);
    setSuiteResults([]);
    setLastOperations([]);
    stop();
    recordBugReportEvent('workspace', 'file-loaded', {
      filename: name,
      scoreId: saved.id,
      measures: fileData.document.score.parts[0]?.staves[0]?.measures.length ?? 0,
      format: 'nxn',
    });
    return saved;
  }, [loadFromNxn, stop, t]);

  const polishImportedScore = useCallback(async (input: {
    xml: string;
    originalFilename: string;
    importedFilename: string;
    format: ImportPolishSourceFormat;
  }) => {
    if (!shouldPolishImportedScore(input.format)) return input.xml;

    setImportStatus(input.format === 'gp'
      ? 'AI Assist is polishing the Guitar Pro import while preserving TAB…'
      : 'AI Assist is polishing the imported score layout…');
    recordBugReportEvent('workspace', 'import-ai-polish:start', {
      originalFilename: input.originalFilename,
      importedFilename: input.importedFilename,
      format: input.format,
    });

    const aiRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: buildImportPolishMessage(input.format, input.originalFilename),
        xml: input.xml,
        provider: provider === 'benchmark' ? 'ollama' : provider,
        ollamaModel,
        aiSettings: aiProviderRequestSettings,
        sessionContext: {
          appLocale: locale,
          taskState: {
            scoreKey: input.importedFilename,
          },
        },
        appLocale: locale,
      }),
    });
    const aiData = await aiRes.json().catch(() => ({}));
    let polishedXml = '';
    let commandCount = 0;
    let appliedPreviewCommands = false;

    if (aiRes.ok && typeof aiData.xml === 'string' && aiData.xml.trim() && !aiData.requiresConfirmation) {
      polishedXml = aiData.xml;
      commandCount = Array.isArray(aiData.commands) ? aiData.commands.length : 0;
    } else if (
      aiRes.ok
      && aiData.workflow === 'layout-cleanup'
      && Array.isArray(aiData.commands)
      && aiData.commands.length > 0
    ) {
      commandCount = aiData.commands.length;
      if (shouldAutoApplyImportPolishCommands(commandCount)) {
        const applyRes = await fetch('/api/apply-operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            xml: input.xml,
            commands: aiData.commands,
          }),
        });
        const applied = await applyRes.json().catch(() => ({}));
        if (applyRes.ok && typeof applied.xml === 'string' && applied.xml.trim()) {
          polishedXml = applied.xml;
          commandCount = applied.commands?.length ?? aiData.commands.length;
          appliedPreviewCommands = true;
        }
      }
    }

    if (polishedXml && shouldAcceptPolishedImportXml({
      originalXml: input.xml,
      polishedXml,
      format: input.format,
    })) {
      recordBugReportEvent('workspace', 'import-ai-polish:success', {
        originalFilename: input.originalFilename,
        importedFilename: input.importedFilename,
        format: input.format,
        workflow: aiData.workflow ?? null,
        commandCount,
        appliedPreviewCommands,
      });
      return polishedXml;
    }

    recordBugReportEvent('workspace', 'import-ai-polish:skipped', {
      originalFilename: input.originalFilename,
      importedFilename: input.importedFilename,
      format: input.format,
      commandCount,
      reason: polishedXml
        ? 'polish-lost-import-fidelity'
        : commandCount > 0 && !shouldAutoApplyImportPolishCommands(commandCount)
          ? 'too-many-layout-cleanup-commands'
          : (aiData.error ?? 'no-polish-result'),
    });
    return input.xml;
  }, [aiProviderRequestSettings, locale, ollamaModel, provider]);

  useEffect(() => {
    if (e2eBootRef.current || xml) return;
    const boot =
      (window as typeof window & {
        __NEX_NOTE_E2E_BOOT__?: { xml?: string; filename?: string };
      }).__NEX_NOTE_E2E_BOOT__
      ?? (() => {
        const chunked = readChunkedE2EBootPayload();
        if (chunked?.xml) return chunked;
        try {
          const raw = localStorage.getItem('nex-note:e2e-boot');
          return raw ? JSON.parse(raw) as { xml?: string; filename?: string } : null;
        } catch {
          return null;
        }
      })();
    if (!boot?.xml) return;
    e2eBootRef.current = true;
    handleXmlFileLoaded(boot.xml, boot.filename ?? 'score.musicxml');
    try {
      if ('cleanup' in boot && typeof boot.cleanup === 'function') boot.cleanup();
      localStorage.removeItem('nex-note:e2e-boot');
    } catch {}
    delete (window as typeof window & {
      __NEX_NOTE_E2E_BOOT__?: { xml?: string; filename?: string };
    }).__NEX_NOTE_E2E_BOOT__;
  }, [handleXmlFileLoaded, xml]);

  const handleOpenNewScoreDialog = useCallback((initialTab: DialogTab = 'instruments') => {
    setNewScoreInitialTab(initialTab);
    setNewScoreDialogOpen(true);
  }, []);

  const handleOpenTemplateDialog = useCallback(() => {
    handleOpenNewScoreDialog('templates');
  }, [handleOpenNewScoreDialog]);

  const handleCreateNewScore = useCallback((draft: NewScoreDraft) => {
    const xml = createNewScoreXml(draft);
    handleXmlFileLoaded(xml, buildNewScoreFilename(draft.title));
    setPrintView(false);
    setWorkspaceTab('assistant');
    setLeftNotationSidebarCollapsed(initialLeftNotationSidebarCollapsed);
    setSidebarCollapsed(initialWorkspaceCollapsed);
    setNewScoreDialogOpen(false);
  }, [handleXmlFileLoaded, initialLeftNotationSidebarCollapsed, initialWorkspaceCollapsed]);

  const handleStartBlankScore = useCallback(() => {
    const draft = createDefaultNewScoreDraft();
    draft.instrumentIds = ['piano'];
    setPendingAutoNoteInput(true);
    handleCreateNewScore(draft);
  }, [handleCreateNewScore]);

  useEffect(() => {
    if (!pendingPrint || !printView || printReadyXml !== xml) return;
    const frame = window.requestAnimationFrame(() => {
      const electronApi = getNexNoteElectronApi();
      if (pendingPdfExport && electronApi?.exportPdf) {
        void electronApi.exportPdf(filename || 'score');
      } else {
        window.print();
      }
      setPendingPrint(false);
      setPendingPdfExport(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filename, pendingPdfExport, pendingPrint, printReadyXml, printView, xml]);

  useEffect(() => {
    if (!pendingAutoNoteInput || !xml) return;
    setPendingAutoNoteInput(false);
    if (!noteInputMode) toggleNoteInput();
  }, [noteInputMode, pendingAutoNoteInput, toggleNoteInput, xml]);

  const handleSelectedFiles = useCallback(async (selectedFiles: File[]) => {
    const receivedFiles = selectedFiles.filter(Boolean);
    if (receivedFiles.length === 0) return;

    const isMultiImageImport = receivedFiles.length > 1;
    const files = isMultiImageImport ? sortScoreImagePages(receivedFiles) : receivedFiles;
    const file = files[0];
    if (!file) return;

    const originalFilename = isMultiImageImport ? getBrowserImageBatchName(files) : file.name;
    const originalSize = totalFileSize(files);
    const originalType = isMultiImageImport ? 'image/page-set' : file.type;

    recordBugReportEvent('workspace', 'import-file:start', {
      filename: originalFilename,
      filenames: isMultiImageImport ? files.map((entry) => entry.name) : undefined,
      size: originalSize,
      type: originalType,
      pageCount: isMultiImageImport ? files.length : undefined,
    });

    try {
      setImportError('');
      if (isMultiImageImport && files.some((entry) => !isImageFilename(entry.name))) {
        throw new Error('Select only image files when importing multiple pages into one score.');
      }

      const isMidiImport = !isMultiImageImport && isMidiFilename(file.name);
      const isImageImport = isMultiImageImport || isImageFilename(file.name);
      const projectDirectory = await getImportProjectDirectory();
      const projectDirectoryLabel = projectDirectory ? formatNxnProjectDirectoryLabel(projectDirectory) : '';
      setImportStatus(isMidiImport
        ? 'Converting MIDI to editable notation…'
        : isMultiImageImport
          ? `Reading ${files.length} image pages with OMR…`
          : isImageImport
            ? 'Reading image notation with OMR…'
          : 'Converting score file…');

      if (!isMultiImageImport && isNxnFilename(file.name)) {
        const data = await readNxnFile(file);
        const saved = handleNxnFileLoaded(data, file.name, { cacheNativeProject: Boolean(projectDirectory) });
        if (projectDirectory) {
          await writeNxnProjectFile(projectDirectory, saved.name, {
            document: data.document,
            session: data.session,
            sourceMusicXml: data.sourceMusicXml,
          });
          setScoreOpenStatus(`Saving ${buildNxnFilename(file.name)} in ${projectDirectoryLabel}…`);
        }
        addRecentFile(file.name, file.size, {
          libraryScoreId: saved.id,
          importedName: saved.name,
        });
        recordBugReportEvent('workspace', 'import-file:success', {
          originalFilename: file.name,
          importedFilename: saved.name,
          format: 'nxn',
        });
        return;
      }

      if (!isMultiImageImport && isLegacyXmlFilename(file.name)) {
        let xmlText = await file.text();
        xmlText = await polishImportedScore({
          xml: xmlText,
          originalFilename: file.name,
          importedFilename: file.name,
          format: 'xml',
        });
        const saved = handleXmlFileLoaded(xmlText, file.name, { cacheNativeProject: Boolean(projectDirectory) });
        if (projectDirectory) {
          setScoreOpenStatus(`Saving ${buildNxnFilename(file.name)} in ${projectDirectoryLabel}…`);
        }
        addRecentFile(file.name, file.size, {
          libraryScoreId: saved.id,
          importedName: saved.name,
        });
        recordBugReportEvent('workspace', 'import-file:success', {
          originalFilename: file.name,
          importedFilename: file.name,
          format: 'xml',
        });
        return;
      }

      const form = new FormData();
      if (isMultiImageImport) {
        for (const imagePage of files) {
          form.append('files', imagePage);
        }
        form.append('batchName', originalFilename);
      } else {
        form.append('file', file);
      }

      const res = await fetch('/api/convert-pdf', { method: 'POST', body: form });
      const text = await res.text();
      const data = text
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return { error: text };
            }
          })()
        : {};
      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed');
      }

      let importedXml = data.xml as string;
      const importedFilename = data.filename as string;
      const midiAnalysis = data.midiAnalysis;
      const importFormat: ImportPolishSourceFormat = isMultiImageImport
        ? 'image'
        : getImportPolishSourceFormat(file.name);

      if (isMidiImport && importedXml) {
        const analysisSummary = typeof midiAnalysis?.summary === 'string' ? midiAnalysis.summary : 'MIDI analysis complete.';
        setImportStatus(`AI Assist is reconstructing notation and layout… ${analysisSummary}`);
        recordBugReportEvent('workspace', 'midi-ai-assist:start', {
          originalFilename: file.name,
          importedFilename,
          analysis: midiAnalysis ?? null,
        });

        const aiRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '/midi-reconstruct rebuild readable notation and layout after MIDI import',
            xml: importedXml,
            provider: provider === 'benchmark' ? 'ollama' : provider,
            ollamaModel,
            aiSettings: aiProviderRequestSettings,
            sessionContext: {
              appLocale: locale,
              midiImport: midiAnalysis ?? null,
              taskState: {
                scoreKey: importedFilename,
              },
            },
            appLocale: locale,
          }),
        });
        const aiData = await aiRes.json().catch(() => ({}));
        if (aiRes.ok && typeof aiData.xml === 'string' && aiData.xml.trim() && !aiData.requiresConfirmation) {
          importedXml = aiData.xml;
          recordBugReportEvent('workspace', 'midi-ai-assist:success', {
            originalFilename: file.name,
            importedFilename,
            commandCount: Array.isArray(aiData.commands) ? aiData.commands.length : 0,
            workflow: aiData.workflow ?? null,
          });
        } else if (
          aiRes.ok
          && (aiData.workflow === 'layout-cleanup' || aiData.workflow === 'midi-reconstruct')
          && Array.isArray(aiData.commands)
          && aiData.commands.length > 0
        ) {
          const applyRes = await fetch('/api/apply-operations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              xml: importedXml,
              commands: aiData.commands,
            }),
          });
          const applied = await applyRes.json().catch(() => ({}));
          if (applyRes.ok && typeof applied.xml === 'string' && applied.xml.trim()) {
            importedXml = applied.xml;
            recordBugReportEvent('workspace', 'midi-ai-assist:success', {
              originalFilename: file.name,
              importedFilename,
              commandCount: applied.commands?.length ?? aiData.commands.length,
              workflow: aiData.workflow,
              appliedPreviewCommands: true,
            });
          } else {
            recordBugReportEvent('workspace', 'midi-ai-assist:skipped', {
              originalFilename: file.name,
              importedFilename,
              reason: applied.error ?? 'apply-layout-cleanup-failed',
            });
          }
        } else {
          recordBugReportEvent('workspace', 'midi-ai-assist:skipped', {
            originalFilename: file.name,
            importedFilename,
            reason: aiData.error ?? (aiData.requiresConfirmation ? 'requires-confirmation' : 'no-cleaned-xml'),
          });
        }
      }
      if (!isMidiImport && importedXml) {
        importedXml = await polishImportedScore({
          xml: importedXml,
          originalFilename,
          importedFilename,
          format: importFormat,
        });
      }

      const saved = handleXmlFileLoaded(importedXml, importedFilename, { cacheNativeProject: Boolean(projectDirectory) });
      if (projectDirectory) {
        setScoreOpenStatus(`Saving ${buildNxnFilename(importedFilename)} in ${projectDirectoryLabel}…`);
      }
      addRecentFile(originalFilename, originalSize, {
        libraryScoreId: saved.id,
        importedName: importedFilename,
      });
      recordBugReportEvent('workspace', 'import-file:success', {
        originalFilename,
        importedFilename,
        format: isMidiImport ? 'midi' : importFormat,
        pageCount: isMultiImageImport ? files.length : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportError(message.replace(/^Error:\s*/, ''));
      recordBugReportEvent('workspace', 'import-file:failed', {
        filename: originalFilename,
        size: originalSize,
        type: originalType,
        pageCount: isMultiImageImport ? files.length : undefined,
        message,
      });
    } finally {
      setImportStatus('');
    }
  }, [aiProviderRequestSettings, getImportProjectDirectory, handleNxnFileLoaded, handleXmlFileLoaded, locale, ollamaModel, polishImportedScore, provider]);

  const handleSelectedFile = useCallback(async (file: File) => {
    await handleSelectedFiles([file]);
  }, [handleSelectedFiles]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const electronApi = getNexNoteElectronApi();
    if (electronApi) {
      let chain = Promise.resolve();
      return electronApi.onOpenFile((payload) => {
        chain = chain.then(async () => {
          await handleSelectedFiles(filesFromElectronOpenPayload(payload));
        }).catch((error) => {
          setImportStatus('');
          setScoreOpenStatus(`Could not open ${getElectronOpenPayloadName(payload)}: ${String(error)}`);
        });
      });
    }

    const target = window as typeof window & {
      __NEX_NOTE_OPEN_FILE__?: (payload: ElectronOpenPayload) => void;
      __NEX_NOTE_PENDING_OPEN_FILES__?: ElectronOpenPayload[];
    };
    let chain = Promise.resolve();
    const openPayload = (payload: ElectronOpenPayload) => {
      chain = chain.then(async () => {
        await handleSelectedFiles(filesFromElectronOpenPayload(payload));
      }).catch((error) => {
        setImportStatus('');
        setScoreOpenStatus(`Could not open ${getElectronOpenPayloadName(payload)}: ${String(error)}`);
      });
    };

    target.__NEX_NOTE_OPEN_FILE__ = openPayload;
    const pending = target.__NEX_NOTE_PENDING_OPEN_FILES__ ?? [];
    target.__NEX_NOTE_PENDING_OPEN_FILES__ = [];
    pending.forEach(openPayload);

    return () => {
      if (target.__NEX_NOTE_OPEN_FILE__ === openPayload) {
        delete target.__NEX_NOTE_OPEN_FILE__;
      }
    };
  }, [handleSelectedFiles]);

  const handleLibraryOpen = useCallback(async (score: LibraryScore) => {
    setScoreOpenStatus(`${t('library.opening')} ${score.name}…`);
    await waitForUiPaint();
    touchLibraryScore(score.id);
    let nativeProjectHandle: FileSystemDirectoryHandle | null = null;
    if (score.nativeName) {
      try {
        nativeProjectHandle = nxnProjectDirectoryRef.current ?? await getSavedNxnProjectDirectoryHandle();
        if (nativeProjectHandle && !(await hasNxnProjectDirectoryPermission(nativeProjectHandle))) {
          nativeProjectHandle = null;
        }
      } catch {
        nativeProjectHandle = null;
      }
    }
    if (score.nativeName && nativeProjectHandle) {
      try {
        const nativeProject = await readNxnProjectFile(nativeProjectHandle, score.nativeName);
        nxnProjectDirectoryRef.current = nativeProjectHandle;
        setNxnProjectDirectoryLabel(formatNxnProjectDirectoryLabel(nativeProjectHandle));
        loadFromNxn(nativeProject);
        setFilename(score.nativeName);
        setNativeProjectCacheEnabled(true);
      } catch {
        if (score.xml) {
          loadXml(score.xml);
          setFilename(score.name);
          setNativeProjectCacheEnabled(false);
        } else {
          setScoreOpenStatus(`Could not find ${score.nativeName}. Choose the project folder or reimport the original file.`);
          return;
        }
      }
    } else {
      if (!score.xml) {
        setScoreOpenStatus(score.nativeName
          ? `Could not access ${score.nativeName}. Choose the project folder or reimport the original file.`
          : `Could not open ${score.name}. Reimport the original file.`);
        return;
      }
      loadXml(score.xml);
      setFilename(score.name);
      setNativeProjectCacheEnabled(false);
    }
    setCurrentScoreId(score.id);
    setBenchmarkResults([]);
    setSuiteResults([]);
    setWorkspaceTab('assistant');
    setLeftNotationSidebarCollapsed(initialLeftNotationSidebarCollapsed);
    setSidebarCollapsed(initialWorkspaceCollapsed);
    setLastOperations([]);
    stop();
    recordBugReportEvent('library', 'open-score', {
      scoreId: score.id,
      filename: score.name,
      format: score.nativeName ? 'nxn' : 'xml',
    });
  }, [initialLeftNotationSidebarCollapsed, initialWorkspaceCollapsed, loadFromNxn, loadXml, stop, t]);

  const handleOpenExtractedPart = useCallback((partId: string, partName: string) => {
    if (!xml) return;
    const extractedXml = extractPartMusicXml(xml, partId);
    const extractedName = buildExtractedPartFilename(filename || 'score.musicxml', partName);
    handleXmlFileLoaded(extractedXml, extractedName);
    setWorkspaceTab('inspector');
    recordBugReportEvent('workspace', 'open-extracted-part', {
      partId,
      partName,
      extractedName,
    });
  }, [filename, handleXmlFileLoaded, xml]);

  const handlePrintViewToggle = useCallback(() => {
    setPrintReadyXml(null);
    setPrintView((current) => !current);
    recordBugReportEvent('workspace', 'toggle-print-view');
  }, []);

  const handlePrintScore = useCallback(() => {
    if (!xml) return;
    if (!printView) {
      setPrintReadyXml(null);
      setPrintView(true);
      setPendingPrint(true);
      return;
    }
    setPendingPrint(true);
    recordBugReportEvent('workspace', 'print-score', {
      fromPrintView: printView,
    });
  }, [printView, xml]);

  const handleExportPdf = useCallback(() => {
    if (!xml) return;
    setPendingPdfExport(true);
    handlePrintScore();
  }, [handlePrintScore, xml]);

  const handleOpenFilePicker = useCallback(() => {
    const electronApi = getNexNoteElectronApi();
    if (electronApi) {
      void electronApi.openFileDialog();
      recordBugReportEvent('workspace', 'open-native-file-dialog');
      return;
    }
    fileInputRef.current?.click();
    recordBugReportEvent('workspace', 'open-file-picker');
  }, []);

  const handleChooseUserTemplate = useCallback((template: UserScoreTemplate) => {
    const key = `${template.sourceLabel ?? ''}:${template.filename}`;
    const content = userTemplateContentRef.current.get(key);
    if (typeof content !== 'string') {
      setUserTemplateStatus(`Could not read local template "${template.name}".`);
      return;
    }
    const file = new File([content], template.filename, {
      type: template.format === 'nxn'
        ? 'application/x.nex-note+json'
        : 'application/vnd.recordare.musicxml+xml',
    });
    setNewScoreDialogOpen(false);
    setScoreOpenStatus(`Opening local template "${template.name}"…`);
    void handleSelectedFile(file);
  }, [handleSelectedFile]);

  const handleImportTemplateFile = useCallback((file: File) => {
    setNewScoreDialogOpen(false);
    setScoreOpenStatus(`Opening template "${file.name}"…`);
    void handleSelectedFile(file);
  }, [handleSelectedFile]);

  const handleSave = useCallback(async () => {
    if (!xml) return;

    const nativeProjectInput = coreDocument && nativeProjectCacheEnabled
      ? {
          document: coreDocument,
          session,
          sourceMusicXml: sourceMusicXml || xml,
        }
      : null;
    const nativeProject = nativeProjectInput ? createNxnFile(nativeProjectInput) : null;
    const saved = saveLibraryScore({
      id: currentScoreId ?? undefined,
      name: filename || 'score.musicxml',
      xml,
      nativeProject,
      nativeName: nativeProject ? buildNxnFilename(filename || 'score.nxn') : null,
      format: nativeProject ? (isNxnFilename(filename) ? 'nxn' : filename.split('.').pop()?.toLowerCase()) : undefined,
    });

    setFilename(saved.name);
    setCurrentScoreId(saved.id);
    addRecentFile(saved.name, saved.sizeBytes, {
      libraryScoreId: saved.id,
      importedName: saved.name,
    });

    if (nativeProjectInput && nxnProjectDirectoryRef.current) {
      await writeNxnProjectFile(nxnProjectDirectoryRef.current, saved.name, nativeProjectInput);
      setNxnProjectDirectoryLabel(formatNxnProjectDirectoryLabel(nxnProjectDirectoryRef.current));
      setScoreOpenStatus(`Saved ${buildNxnFilename(saved.name)} in ${formatNxnProjectDirectoryLabel(nxnProjectDirectoryRef.current)}.`);
      window.setTimeout(() => setScoreOpenStatus(''), 1200);
    } else {
      setScoreOpenStatus(`Saved ${saved.name} to the library.`);
      window.setTimeout(() => setScoreOpenStatus(''), 1200);
    }

    recordBugReportEvent('library', 'save', {
      filename: saved.name,
      scoreId: saved.id,
      nativeProject: Boolean(nativeProjectInput),
    });
  }, [coreDocument, currentScoreId, filename, nativeProjectCacheEnabled, session, sourceMusicXml, xml]);

  const handleSaveAs = useCallback(() => {
    if (!xml) return;

    const currentBaseName = filename.replace(/\.[^.]+$/, '') || 'score';
    const nextName = window.prompt(t('app.saveAs'), currentBaseName);
    if (!nextName) return;

    const trimmedName = nextName.trim();
    if (!trimmedName) return;

    const extension = isNxnFilename(filename)
      ? '.musicxml'
      : (filename.match(/\.[^.]+$/)?.[0] ?? '.musicxml');
    const normalizedName = /\.[^.]+$/.test(trimmedName) ? trimmedName : `${trimmedName}${extension}`;
    const saved = saveLibraryScore({ name: normalizedName, xml });

    startTransition(() => {
      setFilename(saved.name);
      setCurrentScoreId(saved.id);
      setWorkspaceTab('library');
    });
    recordBugReportEvent('library', 'save-as', {
      previousFilename: filename,
      nextFilename: saved.name,
      scoreId: saved.id,
    });
  }, [filename, t, xml]);

  const handleCloseScore = useCallback(() => {
    if (!xml) return;

    stop();
    reset();
    clearSelection();
    setFilename('');
    setCurrentScoreId(null);
    setBenchmarkResults([]);
    setBenchmarkLoading(false);
    setSuiteResults([]);
    setSuiteRunning(false);
    setOllamaSuiteRows([]);
    setOllamaSuiteRunning(false);
    setLastOperations([]);
    setSelectedMeasureNumbers([]);
    setWorkspaceTab('assistant');
    setLeftNotationSidebarCollapsed(true);
    setSidebarCollapsed(true);
    setPrintView(false);
    setNativeProjectCacheEnabled(false);
    setScoreOpenStatus('');
    setImportStatus('');
    setClearMeasureSelectionSignal((value) => value + 1);
    recordBugReportEvent('workspace', 'close-score', {
      filename,
      scoreId: currentScoreId,
    });
  }, [clearSelection, currentScoreId, filename, reset, stop, xml]);

  const handleSaveProject = useCallback(() => {
    if (!coreDocument) return;

    const project = createNxnFile({
      document: coreDocument,
      session,
      sourceMusicXml: sourceMusicXml || xml,
    });
    downloadNxnFile(project, filename || 'score.nxn');
    recordBugReportEvent('workspace', 'download-nxn:success', {
      filename: filename || 'score.nxn',
      revision: coreDocument.revision,
    });
  }, [coreDocument, filename, session, sourceMusicXml, xml]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (getNexNoteElectronApi()) return;
      const metaKey = event.metaKey || event.ctrlKey;
      if (!metaKey) return;

      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === 's') {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          handleSaveAs();
        } else {
          void handleSave();
        }
        return;
      }
      if (normalizedKey === 'o') {
        event.preventDefault();
        event.stopPropagation();
        handleOpenFilePicker();
        return;
      }
      if (normalizedKey === 'w') {
        event.preventDefault();
        event.stopPropagation();
        handleCloseScore();
        return;
      }
      if (normalizedKey === 'n') {
        event.preventDefault();
        event.stopPropagation();
        handleOpenNewScoreDialog();
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [handleCloseScore, handleOpenFilePicker, handleOpenNewScoreDialog, handleSave, handleSaveAs]);

  const xmlPersistRef = useRef<ReturnType<typeof setTimeout>>(null);
  const idlePersistRef = useRef<number | null>(null);
  const lastPersistedRef = useRef<{ id: string | null; name: string; xml: string; revision: number; session: string } | null>(null);
  useEffect(() => {
    if (!xml || !filename || !coreDocument) return;
    if (xmlPersistRef.current) clearTimeout(xmlPersistRef.current);
    const sessionSignature = JSON.stringify(session);
    if (
      lastPersistedRef.current
      && lastPersistedRef.current.id === currentScoreId
      && lastPersistedRef.current.name === filename
      && lastPersistedRef.current.xml === xml
      && lastPersistedRef.current.revision === coreDocument.revision
      && lastPersistedRef.current.session === sessionSignature
    ) {
      return;
    }
    xmlPersistRef.current = setTimeout(() => {
      const persist = async () => {
        const nativeProjectInput = nativeProjectCacheEnabled
          ? {
              document: coreDocument,
              session,
              sourceMusicXml: sourceMusicXml || xml,
            }
          : null;
        const nativeProject = nativeProjectInput ? createNxnFile(nativeProjectInput) : null;
        const saved = saveLibraryScore({
          id: currentScoreId ?? undefined,
          name: filename,
          xml,
          nativeProject,
          nativeName: nativeProject ? buildNxnFilename(filename) : null,
          format: nativeProject ? (isNxnFilename(filename) ? 'nxn' : filename.split('.').pop()?.toLowerCase()) : undefined,
          persistXml: Boolean(nativeProject) || !shouldDeferImportPipeline(xml),
        });
        lastPersistedRef.current = {
          id: saved.id,
          name: saved.name,
          xml,
          revision: coreDocument.revision,
          session: sessionSignature,
        };
        if (!currentScoreId) setCurrentScoreId(saved.id);
        if (nativeProjectInput && nxnProjectDirectoryRef.current) {
          await writeNxnProjectFile(nxnProjectDirectoryRef.current, filename, nativeProjectInput);
          setNxnProjectDirectoryLabel(formatNxnProjectDirectoryLabel(nxnProjectDirectoryRef.current));
        }
      };
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        idlePersistRef.current = window.requestIdleCallback(() => {
          idlePersistRef.current = null;
          void persist().catch((error) => {
            setScoreOpenStatus(`Could not save .nxn project: ${String(error)}`);
          });
        }, { timeout: 1200 });
        return;
      }
      void persist().catch((error) => {
        setScoreOpenStatus(`Could not save .nxn project: ${String(error)}`);
      });
    }, 1600);
    return () => {
      if (xmlPersistRef.current) clearTimeout(xmlPersistRef.current);
      if (idlePersistRef.current != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idlePersistRef.current);
        idlePersistRef.current = null;
      }
    };
  }, [coreDocument, currentScoreId, filename, nativeProjectCacheEnabled, session, sourceMusicXml, xml]);

  const scoreStats = useMemo(() => ({
    measures: (xml.match(/<measure\b/g) ?? []).length,
    parts: (xml.match(/<score-part\b/g) ?? []).length || (xml.match(/<part\b/g) ?? []).length,
    notes: (xml.match(/<note\b/g) ?? []).length,
    hasSelection: Boolean(selectedNote),
  }), [xml, selectedNote]);
  const chatScoreKey = useMemo(
    () => (xml ? buildChatScoreKey(filename, xml, currentScoreId) : undefined),
    [currentScoreId, filename, xml],
  );
  const scoreRevision = coreDocument?.revision ?? 0;
  const deferredXml = useDeferredValue(xml);
  const deferredCoreDocument = useDeferredValue(coreDocument);
  const activeStatus = importError || importStatus || embedStartup.message || scoreOpenStatus;
  const activeStatusIsError = Boolean(importError) || (!importStatus && embedStartup.phase === 'error');
  const activeStatusIsLoading = !activeStatusIsError;
  const scoreSessionReady = Boolean(chatScoreKey && scoreSessionRevision === scoreRevision);
  const doctorAutoReportSignatureRef = useRef('');

  const handleScoreRenderStart = useCallback(() => {
    if (!embedConfig.enabled) return;
    setEmbedStartup((current) => (
      current.phase === 'ready' || current.phase === 'error'
        ? current
        : { phase: 'rendering', message: 'Rendering embedded score...' }
    ));
  }, [embedConfig.enabled]);

  const handleScoreRenderError = useCallback((message: string) => {
    setScoreOpenStatus('');
    if (embedConfig.enabled) {
      setEmbedStartup({ phase: 'error', message });
    }
  }, [embedConfig.enabled]);

  useEffect(() => {
    registerDoctorRunner((domain?: DoctorDomain) => {
      const settings = readDoctorSettings();
      return buildDocumentDoctorReport({
        trigger: 'manual',
        settings: {
          ...settings,
          enabled: true,
          mode: settings.mode === 'off' ? 'manual' : settings.mode,
          domains: domain ? [domain] : settings.domains,
        },
        hasDocument: Boolean(xml.trim() || coreDocument),
        coreDocument,
        diagnostics,
        commands: lastCommands,
        previousRevision: historyMeta.lastTransaction?.beforeRevision ?? null,
        revision: scoreRevision,
      });
    });

    const settings = readDoctorSettings();
    if (!settings.enabled) return;
    if (importLifecycle.deferred && !coreDocument) return;
    const report = buildDocumentDoctorReport({
      trigger: 'manual',
      settings,
      hasDocument: Boolean(xml.trim() || coreDocument),
      coreDocument,
      diagnostics,
      commands: lastCommands,
      previousRevision: historyMeta.lastTransaction?.beforeRevision ?? null,
      revision: scoreRevision,
    });
    const signature = JSON.stringify({
      revision: report.revision,
      previousRevision: report.previousRevision,
      issueCount: report.issueCount,
      commandTypes: report.commandTypes,
      diagnostics: report.diagnostics.map((diagnostic) => `${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`),
    });
    if (doctorAutoReportSignatureRef.current === signature) return;
    doctorAutoReportSignatureRef.current = signature;
    publishDoctorReport(report);
  }, [coreDocument, diagnostics, historyMeta.lastTransaction?.beforeRevision, importLifecycle.deferred, lastCommands, scoreRevision]);

  // True when the current selection (note OR rest) sits on a TAB staff, so the
  // collapsed-sidebar TAB chip is reachable before the first fret exists.
  const selectionOnTabStaff = useMemo(() => {
    if (!selectedNote || !coreDocument) return false;
    const part = coreDocument.score.parts.find((candidate) => (
      (selectedNote.corePartId && candidate.id === selectedNote.corePartId)
      || candidate.staves.some((staff) => staff.measures.some((measure) => measure.id === selectedNote.coreMeasureId))
    )) ?? coreDocument.score.parts[0] ?? null;
    return Boolean(part?.staves
      .find((staff) => staff.staffIndex === selectedNote.staffIndex)
      ?.measures.some((measure) => measure.attributes.some((attribute) => (
        attribute.clefs.some((clef) => clef.staffIndex === selectedNote.staffIndex && clef.sign?.toUpperCase() === 'TAB')
      ))));
  }, [coreDocument, selectedNote]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = window as typeof window & {
      __NEX_NOTE_SELECTION_CONFIDENCE__?: unknown;
      __NEX_NOTE_E2E_STATE__?: {
        xml: string;
        filename: string;
        noteInputMode: boolean;
        chordInputMode: boolean;
        selectedDuration: string;
        selectedAccidental: typeof selectedAccidental;
        selectedVoice: number;
        selectionCount: number;
        canUndo: boolean;
        canRedo: boolean;
        historyDepth: number;
        playbackState: string;
        currentMeasure: number | null;
        currentBeat: number | null;
        totalBeats: number | null;
        playbackError: string | null;
        lastCommandTypes: string[];
        importLifecycle: ImportLifecycleState;
        scoreStats: typeof scoreStats;
        selectedNote: (ScoreDocumentSelectionAnchor['anchorLocator'] & {
          coreEntityId?: string | null;
          coreMeasureId?: string | null;
          corePartId?: string | null;
          coreVoiceId?: string | null;
          partName?: string | null;
          step?: string;
          octave?: number;
          alter?: number;
          isRest?: boolean;
          pitchLabel?: string;
          guitar?: { string: number; fret: number; tuning?: string } | null;
        }) | null;
        noteInputAnchor: (ScoreDocumentSelectionAnchor['anchorLocator'] & {
          coreEntityId?: string | null;
          coreMeasureId?: string | null;
          corePartId?: string | null;
          coreVoiceId?: string | null;
          partName?: string | null;
          step?: string;
          octave?: number;
          alter?: number;
          isRest?: boolean;
          pitchLabel?: string;
          guitar?: { string: number; fret: number; tuning?: string } | null;
        }) | null;
        selectionConfidence?: unknown;
        selectedTarget?: unknown;
        editTarget?: unknown;
        candidateList?: unknown[];
        commandPayload?: ScoreCommand[];
        undoRedoState?: {
          canUndo: boolean;
          canRedo: boolean;
          historyDepth: number;
          lastAction?: string;
          lastTransaction?: unknown;
        };
        confidenceReason?: string | null;
      };
    };
    const selectedPart = selectedNote
      ? coreDocument?.score.parts.find((part) => (
          (selectedNote.corePartId && part.id === selectedNote.corePartId)
          || part.staves.some((staff) => staff.measures.some((measure) => measure.id === selectedNote.coreMeasureId))
        )) ?? null
      : null;
    const anchorPart = noteInputAnchor
      ? coreDocument?.score.parts.find((part) => (
          (noteInputAnchor.corePartId && part.id === noteInputAnchor.corePartId)
          || part.staves.some((staff) => staff.measures.some((measure) => measure.id === noteInputAnchor.coreMeasureId))
        )) ?? null
      : null;
    const pitchLabel = (note: typeof selectedNote) => {
      if (!note) return null;
      if (note.isRest) return 'Rest';
      const accidental = note.alter === 1 ? '#' : note.alter === -1 ? 'b' : note.alter === 2 ? '##' : note.alter === -2 ? 'bb' : '';
      return `${note.step}${accidental}${note.octave}`;
    };
    const previousE2EState = target.__NEX_NOTE_E2E_STATE__;
    const selectionConfidence = target.__NEX_NOTE_SELECTION_CONFIDENCE__ ?? previousE2EState?.selectionConfidence ?? null;
    const confidenceRecord = selectionConfidence && typeof selectionConfidence === 'object'
      ? selectionConfidence as Record<string, unknown>
      : null;
    const candidateList = Array.isArray(confidenceRecord?.candidates) ? confidenceRecord.candidates : [];
    const selectedTarget = confidenceRecord?.selectedTarget ?? (
      selectedNote ? {
        coreEntityId: selectedNote.coreEntityId ?? null,
        coreVoiceId: selectedNote.coreVoiceId ?? null,
        coreMeasureId: selectedNote.coreMeasureId ?? null,
        corePartId: selectedNote.corePartId ?? null,
        measureNumber: selectedNote.measureNumber,
        staffIndex: selectedNote.staffIndex,
        voiceId: selectedNote.voiceId,
        timestampNum: selectedNote.timestampNum,
        timestampDen: selectedNote.timestampDen,
        step: selectedNote.step,
        octave: selectedNote.octave,
        alter: selectedNote.alter,
        isRest: selectedNote.isRest,
        guitar: selectedNote.guitar ?? null,
      } : null
    );
    const editTarget = lastCommands[0] && 'measureNumber' in lastCommands[0]
      ? lastCommands[0]
      : selectedTarget;
    const confidenceReason = typeof confidenceRecord?.winnerReason === 'string'
      ? confidenceRecord.winnerReason
      : typeof confidenceRecord?.fallbackReason === 'string'
        ? confidenceRecord.fallbackReason
        : null;
    target.__NEX_NOTE_E2E_STATE__ = {
      xml,
      filename,
      noteInputMode,
      chordInputMode,
      selectedDuration,
      selectedAccidental,
      selectedVoice,
      selectionCount: selection.selectionCount,
      canUndo,
      canRedo,
      historyDepth: historyMeta.depth,
      playbackState,
      currentMeasure,
      currentBeat,
      totalBeats,
      playbackError,
      lastCommandTypes: lastCommands.map((command) => command.type),
      importLifecycle,
      commandPayload: lastCommands,
      undoRedoState: {
        canUndo,
        canRedo,
        historyDepth: historyMeta.depth,
        lastAction: historyMeta.lastAction,
        lastTransaction: historyMeta.lastTransaction ?? null,
      },
      scoreStats,
      selectedNote: selectedNote ? {
        coreEntityId: selectedNote.coreEntityId ?? null,
        coreVoiceId: selectedNote.coreVoiceId ?? null,
        coreMeasureId: selectedNote.coreMeasureId ?? null,
        corePartId: selectedNote.corePartId ?? null,
        partName: selectedPart?.name ?? null,
        measureNumber: selectedNote.measureNumber,
        staffIndex: selectedNote.staffIndex,
        voiceId: selectedNote.voiceId,
        timestampNum: selectedNote.timestampNum,
        timestampDen: selectedNote.timestampDen,
        step: selectedNote.step,
        octave: selectedNote.octave,
        alter: selectedNote.alter,
        isRest: selectedNote.isRest,
        pitchLabel: pitchLabel(selectedNote) ?? undefined,
        guitar: selectedNote.guitar ?? null,
      } : null,
      noteInputAnchor: noteInputAnchor ? {
        coreEntityId: noteInputAnchor.coreEntityId ?? null,
        coreVoiceId: noteInputAnchor.coreVoiceId ?? null,
        coreMeasureId: noteInputAnchor.coreMeasureId ?? null,
        corePartId: noteInputAnchor.corePartId ?? null,
        partName: anchorPart?.name ?? null,
        measureNumber: noteInputAnchor.measureNumber,
        staffIndex: noteInputAnchor.staffIndex,
        voiceId: noteInputAnchor.voiceId,
        timestampNum: noteInputAnchor.timestampNum,
        timestampDen: noteInputAnchor.timestampDen,
        step: noteInputAnchor.step,
        octave: noteInputAnchor.octave,
        alter: noteInputAnchor.alter,
        isRest: noteInputAnchor.isRest,
        pitchLabel: pitchLabel(noteInputAnchor) ?? undefined,
        guitar: noteInputAnchor.guitar ?? null,
      } : null,
      selectionConfidence,
      selectedTarget,
      editTarget,
      candidateList,
      confidenceReason,
    };
  }, [canRedo, canUndo, chordInputMode, coreDocument, currentBeat, currentMeasure, filename, historyMeta.depth, importLifecycle, lastCommands, noteInputAnchor, noteInputMode, playbackError, playbackState, scoreStats, selectedAccidental, selectedDuration, selectedNote, selectedVoice, selection.selectionCount, totalBeats, xml]);

  useEffect(() => {
    const doctorState = getDoctorRuntimeState();
    setBugReportContext({
      filename,
      currentScoreId,
      scoreKey: chatScoreKey,
      scoreRevision,
      provider,
      ollamaModel,
      workspaceTab,
      sidebarCollapsed,
      printView,
      selectionCount: selection.selectionCount,
      selectedMeasureNumbers,
      noteInputMode,
      chordInputMode,
      selectedDuration,
      selectedVoice,
      clipboardCount,
      canUndo,
      canRedo,
      historyDepth: historyMeta.depth,
      historyMeta,
      lastCommands,
      lastOperations,
      scoreStats,
      selectedNote: selectedNote ? {
        measureNumber: selectedNote.measureNumber,
        staffIndex: selectedNote.staffIndex,
        voiceId: selectedNote.voiceId,
        timestampNum: selectedNote.timestampNum,
        timestampDen: selectedNote.timestampDen,
        step: selectedNote.step,
        octave: selectedNote.octave,
        alter: selectedNote.alter,
        isRest: selectedNote.isRest,
      } : null,
      playback: {
        state: playbackState,
        currentMeasure,
        currentBeat,
        totalBeats,
        midiLoading,
        hasMidi,
        error: playbackError,
        tempoOverride,
        metronomeEnabled,
      },
      benchmark: {
        loading: benchmarkLoading,
        suiteRunning,
        ollamaSuiteRunning,
        benchmarkResultCount: benchmarkResults.length,
        suiteResultCount: suiteResults.length,
        ollamaSuiteRowCount: ollamaSuiteRows.length,
      },
      doctor: {
        enabled: doctorState?.settings.enabled ?? false,
        mode: doctorState?.settings.mode ?? 'off',
        lastIssueCount: doctorState?.lastReport?.issueCount ?? null,
        lastErrorCount: doctorState?.lastReport?.errorCount ?? null,
        historyCount: doctorState?.history.length ?? 0,
      },
    });
  }, [benchmarkLoading, benchmarkResults.length, canRedo, canUndo, chatScoreKey, chordInputMode, clipboardCount, currentBeat, currentMeasure, currentScoreId, filename, hasMidi, historyMeta, lastCommands, lastOperations, metronomeEnabled, midiLoading, noteInputMode, ollamaModel, ollamaSuiteRows.length, ollamaSuiteRunning, playbackError, playbackState, printView, provider, scoreRevision, scoreStats, selectedDuration, selectedMeasureNumbers, selectedNote, selectedVoice, selection.selectionCount, sidebarCollapsed, suiteResults.length, suiteRunning, tempoOverride, totalBeats, workspaceTab]);

  useEffect(() => {
    setScoreSessionRevision(null);
  }, [chatScoreKey]);

  useEffect(() => {
    if (!chatScoreKey || !xml) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch('/api/score-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreKey: chatScoreKey,
          revision: scoreRevision,
          xml,
          selection: serializeEditorSelection(selection),
        }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (cancelled || !data?.session) return;
          setScoreSessionRevision(data.session.revision);
        })
        .catch(() => {});
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chatScoreKey, scoreRevision, selection, xml]);

  useEffect(() => {
    if (!supportsBugReportDirectoryExport()) return;
    let cancelled = false;
    void getSavedBugReportDirectoryHandle()
      .then((handle) => {
        if (cancelled) return;
        setBugReportDirectoryLabel(formatBugReportDirectoryLabel(handle));
      })
      .catch(() => {
        if (cancelled) return;
        setBugReportDirectoryLabel('Browser download fallback');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildScoreRequestPayload = useCallback(() => ({
    xml: scoreSessionReady ? undefined : xml,
    scoreKey: chatScoreKey,
    scoreRevision,
  }), [chatScoreKey, scoreRevision, scoreSessionReady, xml]);

  const handleXmlUpdate = useCallback((nextXml: string, meta?: { label?: string; commands?: ScoreCommand[]; selectionAnchor?: ScoreDocumentSelectionAnchor | null }) => {
    replaceXml(nextXml, meta);
    recordBugReportEvent('document', 'replace-xml', {
      label: meta?.label ?? null,
      commandTypes: meta?.commands?.map((command) => command.type) ?? [],
      commandCount: meta?.commands?.length ?? 0,
      nextMeasures: (nextXml.match(/<measure\b/g) ?? []).length,
    });
  }, [replaceXml]);

  const handleBenchmark = useCallback(async (message: string) => {
    recordBugReportEvent('benchmark', 'run-benchmark', {
      message,
      ollamaModel,
    });
    setBenchmarkPrompt(message);
    setBenchmarkLoading(true);
    setBenchmarkResults([]);
    setSuiteResults([]);
    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ollamaModel, aiSettings: aiProviderRequestSettings, ...buildScoreRequestPayload() }),
      });
      const data = await res.json();
      setBenchmarkResults(data.results ?? []);
    } finally {
      setBenchmarkLoading(false);
    }
  }, [aiProviderRequestSettings, buildScoreRequestPayload, ollamaModel]);

  const handleRunOllamaSuite = useCallback(async (modelsOverride?: OllamaModelOption[], mode: 'smart' | 'all' = 'all') => {
    if (!xml) return;
    const modelsToTest = modelsOverride?.length ? modelsOverride : ollamaModels;
    recordBugReportEvent('benchmark', 'run-ollama-suite', {
      totalTests: OLLAMA_MODEL_SUITE.length,
      mode,
      modelIds: modelsToTest.map((model) => model.id),
    });
    setOllamaSuiteMode(mode);
    setOllamaSuiteRunning(true);
    setOllamaSuiteRows([]);
    setBenchmarkResults([]);
    setSuiteResults([]);

    const accumulated: OllamaSuiteRow[] = [];

    for (let i = 0; i < OLLAMA_MODEL_SUITE.length; i++) {
      const testCase = OLLAMA_MODEL_SUITE[i];
      setOllamaSuiteProgress({ current: i + 1, total: OLLAMA_MODEL_SUITE.length, currentLabel: testCase.label });

      try {
        const res = await fetch('/api/benchmark-ollama', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: testCase.instruction,
            testCase,
            models: modelsToTest,
            aiSettings: aiProviderRequestSettings,
            ...buildScoreRequestPayload(),
          }),
        });
        const data = await res.json();
        accumulated.push({ testCase, modelResults: data.results ?? [] });
      } catch {
        accumulated.push({ testCase, modelResults: [] });
      }

      setOllamaSuiteRows([...accumulated]);
    }

    setOllamaSuiteRunning(false);
  }, [aiProviderRequestSettings, buildScoreRequestPayload, ollamaModels, xml]);

  const handleRunSmartOllamaSuite = useCallback(() => {
    void handleRunOllamaSuite(smartOllamaModels, 'smart');
  }, [handleRunOllamaSuite, smartOllamaModels]);

  const handleRunAllOllamaSuite = useCallback(() => {
    void handleRunOllamaSuite(ollamaModels, 'all');
  }, [handleRunOllamaSuite, ollamaModels]);

  const handleRunSuite = useCallback(async (providers?: ProviderName[]) => {
    if (!xml) return;
    recordBugReportEvent('benchmark', 'run-provider-suite', {
      totalTests: BENCHMARK_SUITE.length,
      ollamaModel,
      providers: providers ?? ['ollama', 'claude', 'gemini'],
    });
    setSuiteRunning(true);
    setSuiteResults([]);
    setBenchmarkResults([]);

    const accumulated: SuiteResult[] = [];

    for (let i = 0; i < BENCHMARK_SUITE.length; i++) {
      const testCase = BENCHMARK_SUITE[i];
      setSuiteProgress({ current: i + 1, total: BENCHMARK_SUITE.length, currentLabel: testCase.label });

      try {
        const res = await fetch('/api/benchmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: testCase.instruction, ollamaModel, providers, aiSettings: aiProviderRequestSettings, ...buildScoreRequestPayload() }),
        });
        const data = await res.json();
        accumulated.push({ testCase, providerResults: data.results ?? [] });
      } catch {
        accumulated.push({ testCase, providerResults: [] });
      }

      setSuiteResults([...accumulated]);
    }

    setSuiteRunning(false);
  }, [aiProviderRequestSettings, buildScoreRequestPayload, ollamaModel, xml]);

  const handleRunOllamaProviderSuite = useCallback(() => {
    void handleRunSuite(['ollama']);
  }, [handleRunSuite]);

  function downloadBlob(blob: Blob, downloadName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleDownload() {
    const downloadName = getMxlFilename(filename);
    recordBugReportEvent('workspace', 'download-mxl:start', { filename: downloadName });
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml, filename: downloadName }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    downloadBlob(blob, downloadName);
    recordBugReportEvent('workspace', 'download-mxl:success', { filename: downloadName });
  }

  async function handleDownloadAbc() {
    recordBugReportEvent('workspace', 'download-abc:start', { filename });
    const res = await fetch('/api/export-abc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml, filename }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`ABC export failed: ${data.error ?? res.statusText}`);
      return;
    }
    const blob = await res.blob();
    const downloadName = filename.replace(/\.[^.]+$/, '') + '.abc' || 'score.abc';
    downloadBlob(blob, downloadName);
    recordBugReportEvent('workspace', 'download-abc:success', { filename: downloadName });
  }

  async function handleDownloadParts() {
    if (!xml) return;
    try {
      const { bytes, entries } = await buildPartsArchive(xml, filename);
      const downloadName = `${filename.replace(/\.[^.]+$/, '') || 'score'}-parts.zip`;
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), downloadName);
      recordBugReportEvent('workspace', 'download-parts:success', { filename: downloadName, parts: entries.length });
    } catch (error) {
      alert(`Parts export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleDownloadPracticePack() {
    recordBugReportEvent('workspace', 'download-practice-pack:start', { filename });
    const res = await fetch('/api/export-practice-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml, filename }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Practice pack export failed: ${data.error ?? res.statusText}`);
      return;
    }
    const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
    const downloadName = `${filename.replace(/\.[^.]+$/, '') || 'score'}.practice-pack.json`;
    downloadBlob(blob, downloadName);
    recordBugReportEvent('workspace', 'download-practice-pack:success', { filename: downloadName });
  }

  useEffect(() => {
    const electronApi = getNexNoteElectronApi();
    if (!electronApi) return;
    electronApi.updateMenuState({
      hasScore: Boolean(xml),
      hasCoreDocument: Boolean(coreDocument),
      canUndo,
      canRedo,
      hasSelection: Boolean(selectedNote || selectedNotes.length > 0 || selection.selectionCount > 0 || selectedMeasureNumbers.length > 0),
      activeViewMode: session.viewMode ?? 'continuous-vertical',
      printView,
    });
  }, [
    canRedo,
    canUndo,
    coreDocument,
    printView,
    selectedMeasureNumbers.length,
    selectedNote,
    selectedNotes.length,
    selection.selectionCount,
    session.viewMode,
    xml,
  ]);

  function handleCloseBenchmark() {
    setBenchmarkResults([]);
    setBenchmarkLoading(false);
    setSuiteResults([]);
    setSuiteRunning(false);
    setOllamaSuiteRows([]);
    setOllamaSuiteRunning(false);
    setProvider('ollama');
  }

  const showBenchmark = provider === 'benchmark' || benchmarkLoading || benchmarkResults.length > 0
    || suiteRunning || suiteResults.length > 0
    || ollamaSuiteRunning || ollamaSuiteRows.length > 0;

  const getMxlFilename = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'score.mxl';
    if (/\.(musicxml|mxl|xml|pdf)$/i.test(trimmed)) {
      return trimmed.replace(/\.(musicxml|mxl|xml|pdf)$/i, '.mxl');
    }
    return `${trimmed}.mxl`;
  }, []);

  const handleApplyCommands = useCallback((commands: ScoreCommand[], label?: string) => {
    const result = applyCommands(commands, {
      label,
      selectionAnchor: currentSelectionAnchor,
    });
    if (!result || result.applied) {
      setLastOperations(commands);
    }
    recordBugReportEvent('commands', 'apply', {
      label: label ?? null,
      commandTypes: commands.map((command) => command.type),
      commandCount: commands.length,
      result: result ?? null,
    });
    return result;
  }, [applyCommands, currentSelectionAnchor]);

  const currentDocumentRef = useRef(coreDocument);
  currentDocumentRef.current = coreDocument;

  const handleLayoutCleanup = useCallback(async () => {
    if (!xml || layoutCleanupLoading) return;
    const requestedDocument = coreDocument;

    setLayoutCleanupLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '/layout-cleanup tidy up the score layout',
          ...buildScoreRequestPayload(),
          xml,
          provider: provider === 'benchmark' ? 'ollama' : provider,
          ollamaModel,
          aiSettings: aiProviderRequestSettings,
          appLocale: locale,
        }),
      });
      const data = await res.json();

      // Cleanup commands describe the requested document. Even confirmed
      // commands must never be applied to an edited or newly opened score.
      if (currentDocumentRef.current !== requestedDocument) {
        window.alert(t('toolbar.layoutStale'));
        return;
      }

      if (!res.ok) {
        window.alert(`Layout cleanup failed: ${data.error ?? 'Unknown error'}`);
        return;
      }

      const commands = (data.commands ?? data.operations) as ScoreCommand[] | undefined;
      if (!commands || commands.length === 0) {
        if (typeof data.explanation === 'string' && data.explanation.trim()) {
          window.alert(data.explanation);
        }
        return;
      }

      if (data.requiresConfirmation) {
        const details = [
          typeof data.explanation === 'string' ? data.explanation : t('chat.previewPrepared'),
          Array.isArray(data.affectedMeasures) && data.affectedMeasures.length
            ? `Measures: ${data.affectedMeasures.join(', ')}`
            : '',
          Array.isArray(data.plan) && data.plan.length
            ? `Plan: ${data.plan.join(' -> ')}`
            : '',
          `${t('toolbar.layout')}?`,
        ].filter(Boolean).join('\n\n');

        if (!window.confirm(details)) return;
        handleApplyCommands(commands, 'Layout cleanup');
        return;
      }

      handleXmlUpdate(data.xml, {
        label: 'Layout cleanup',
        commands,
      });
      setLastOperations(commands);
      recordBugReportEvent('commands', 'layout-cleanup:replace-xml', {
        commandTypes: commands.map((command) => command.type),
        commandCount: commands.length,
      });
    } catch (error) {
      window.alert(`Layout cleanup failed: ${String(error)}`);
    } finally {
      setLayoutCleanupLoading(false);
    }
  }, [aiProviderRequestSettings, buildScoreRequestPayload, coreDocument, handleApplyCommands, handleXmlUpdate, layoutCleanupLoading, locale, ollamaModel, provider, t, xml]);

  const handlePlay = useCallback(async () => {
    if (!xml) return;
    recordBugReportEvent('playback', 'play-request', {
      fromState: playbackState,
      selectedNote: activePlaybackNote ? {
        measureNumber: activePlaybackNote.measureNumber,
        staffIndex: activePlaybackNote.staffIndex,
        voiceId: activePlaybackNote.voiceId,
        timestampNum: activePlaybackNote.timestampNum,
        timestampDen: activePlaybackNote.timestampDen,
      } : null,
    });
    const [ready] = await Promise.all([
      ensureMidiLoaded(xml),
      prewarm(),
    ]);
    if (!ready) return;
    markMidiReady(xml);
    playbackStartNoteKeyRef.current = activePlaybackNote ? playbackNoteKey(activePlaybackNote) : null;
    if (activePlaybackNote) {
      await startFromNote(activePlaybackNote);
      return;
    }
    await play();
  }, [activePlaybackNote, ensureMidiLoaded, markMidiReady, play, playbackState, prewarm, startFromNote, xml]);

  const handleScoreNoteClick = useCallback((note: SelectedNote | null, options?: {
    additive?: boolean;
    range?: boolean;
    selectionNotes?: SelectedNote[];
    singleSelectionOnly?: boolean;
    visualOnly?: boolean;
    visualText?: string | null;
    visualMeasureNumber?: number | null;
    visualStaffIndex?: number | null;
  }) => {
    const simultaneousNotes = !options?.additive && !options?.range && !options?.singleSelectionOnly && !options?.visualOnly
      ? (options?.selectionNotes && options.selectionNotes.length > 0
        ? options.selectionNotes
        : resolveSimultaneousNoteSelection(coreDocument, note))
      : [];
    const clickOptions = simultaneousNotes.length > 1
      ? { ...options, selectionNotes: simultaneousNotes }
      : options;
    handleNoteClick(note, clickOptions);
    recordBugReportEvent('score', 'note-click', {
      note: note ? {
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        voiceId: note.voiceId,
        timestampNum: note.timestampNum,
        timestampDen: note.timestampDen,
        step: note.step,
        octave: note.octave,
        alter: note.alter,
        isRest: note.isRest,
      } : null,
      simultaneousNoteCount: simultaneousNotes.length,
      options: options ?? null,
    });
    if (options?.additive || options?.range || options?.visualOnly || !note) return;
    if (playbackState === 'playing') {
      void startFromNote(note);
      return;
    }

    void (async () => {
      const notesToPreview = simultaneousNotes.length > 0 ? simultaneousNotes : [note];
      if (playbackSampleBank) {
        await previewNotes(notesToPreview);
        return;
      }
      if (xml && await ensureMidiLoaded(xml)) {
        if (currentDocumentRef.current !== coreDocument) return;
        markMidiReady(xml);
        await seekToCursorTarget({
          measureNumber: note.measureNumber,
          timestampNum: note.timestampNum,
          timestampDen: note.timestampDen,
        });
      }
      if (currentDocumentRef.current !== coreDocument) return;
      await previewNotes(notesToPreview);
    })();
  }, [coreDocument, ensureMidiLoaded, handleNoteClick, markMidiReady, playbackSampleBank, playbackState, previewNotes, seekToCursorTarget, startFromNote, xml]);

  useEffect(() => {
    const target = window as typeof window & {
      __NEX_NOTE_E2E_SELECT_NOTE__?: (locator: {
        measureNumber: number;
        staffIndex: number;
        voiceId?: number;
        timestampNum: number;
        timestampDen: number;
        step?: string;
        octave?: number;
      }) => boolean;
    };
    target.__NEX_NOTE_E2E_SELECT_NOTE__ = (locator) => {
      if (!coreDocument) return false;
      const entry = buildSemanticSelectionEntries(coreDocument).find((candidate) => (
        candidate.measureNumber === locator.measureNumber
        && candidate.staffIndex === locator.staffIndex
        && candidate.voiceId === (locator.voiceId ?? candidate.voiceId)
        && candidate.timestampNum * locator.timestampDen === locator.timestampNum * candidate.timestampDen
        && (locator.step == null || candidate.step === locator.step)
        && (locator.octave == null || candidate.octave === locator.octave)
      ));
      if (!entry) return false;
      handleScoreNoteClick({
        coreEntityId: entry.coreEntityId,
        coreVoiceId: entry.coreVoiceId,
        coreMeasureId: entry.coreMeasureId,
        corePartId: entry.corePartId,
        measureNumber: entry.measureNumber,
        staffIndex: entry.staffIndex,
        voiceId: entry.voiceId,
        timestampNum: entry.timestampNum,
        timestampDen: entry.timestampDen,
        step: entry.step,
        octave: entry.octave,
        alter: entry.alter,
        isRest: entry.isRest,
        durationType: entry.durationType,
        isDotted: entry.isDotted,
        graphicalNote: null,
      });
      return true;
    };
    return () => {
      delete target.__NEX_NOTE_E2E_SELECT_NOTE__;
    };
  }, [coreDocument, handleScoreNoteClick]);

  const handleUndo = useCallback(() => {
    undo();
    recordBugReportEvent('commands', 'undo');
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
    recordBugReportEvent('commands', 'redo');
  }, [redo]);

  useEffect(() => {
    const electronApi = getNexNoteElectronApi();
    if (!electronApi) return;

    return electronApi.onMenuCommand((commandId) => {
      const runNativeClipboardCommand = (command: NativeEditCommand) => {
        if (!shouldUseNativeMenuClipboardCommand()) return false;
        void electronApi.performNativeEditCommand(command);
        return true;
      };

      switch (commandId) {
        case 'file:new':
          handleOpenNewScoreDialog();
          break;
        case 'file:open':
          handleOpenFilePicker();
          break;
        case 'file:save':
          void handleSave();
          break;
        case 'file:saveAs':
          handleSaveAs();
          break;
        case 'file:saveProject':
          handleSaveProject();
          break;
        case 'file:exportMxl':
          void handleDownload();
          break;
        case 'file:exportAbc':
          void handleDownloadAbc();
          break;
        case 'file:exportParts':
          void handleDownloadParts();
          break;
        case 'file:exportPdf':
          handleExportPdf();
          break;
        case 'file:exportPracticePack':
          void handleDownloadPracticePack();
          break;
        case 'file:closeScore':
          handleCloseScore();
          break;
        case 'edit:undo':
          if (shouldUseNativeMenuHistoryCommand()) {
            void electronApi.performNativeEditCommand('undo');
            break;
          }
          handleUndo();
          break;
        case 'edit:redo':
          if (shouldUseNativeMenuHistoryCommand()) {
            void electronApi.performNativeEditCommand('redo');
            break;
          }
          handleRedo();
          break;
        case 'edit:cut':
          if (runNativeClipboardCommand('cut')) break;
          cutSelection();
          break;
        case 'edit:copy':
          if (runNativeClipboardCommand('copy')) break;
          copySelection();
          break;
        case 'edit:paste':
          if (runNativeClipboardCommand('paste')) break;
          pasteClipboard();
          break;
        case 'edit:duplicateSelection':
          duplicateSelection();
          break;
        case 'edit:deleteSelectedNote':
          handleDeleteSelection();
          break;
        case 'edit:find':
          dispatchScoreViewCommand('focus-find');
          break;
        case 'view:toggleNavigator':
          dispatchScoreViewCommand('toggle-navigator');
          break;
        case 'view:toggleInspector':
          setSidebarCollapsed(false);
          setWorkspaceTab('inspector');
          break;
        case 'view:toggleAssistant':
          setSidebarCollapsed(false);
          setWorkspaceTab('assistant');
          break;
        case 'view:zoomIn':
          dispatchScoreViewCommand('zoom-in');
          break;
        case 'view:zoomOut':
          dispatchScoreViewCommand('zoom-out');
          break;
        case 'view:resetZoom':
          dispatchScoreViewCommand('zoom-reset');
          break;
        case 'view:page':
          dispatchScoreViewCommand('set-view-mode', 'page');
          break;
        case 'view:continuousVertical':
          dispatchScoreViewCommand('set-view-mode', 'continuous-vertical');
          break;
        case 'view:continuousHorizontal':
          dispatchScoreViewCommand('set-view-mode', 'continuous-horizontal');
          break;
        case 'view:togglePrintView':
          handlePrintViewToggle();
          break;
        case 'help:commandCenter':
          if (xml && selectedNote) {
            window.dispatchEvent(new CustomEvent('nex-note:focus-inline-chord-symbol'));
            recordBugReportEvent('workspace', 'focus-inline-chord-symbol', {
              source: 'electron-menu',
            });
          } else {
            setCommandCenterOpen(true);
          }
          break;
        default:
          break;
      }
    });
  }, [
    copySelection,
    cutSelection,
    dispatchScoreViewCommand,
    duplicateSelection,
    filename,
    handleCloseScore,
    handleDeleteSelection,
    handleExportPdf,
    handleOpenFilePicker,
    handleOpenNewScoreDialog,
    handlePrintViewToggle,
    handleRedo,
    handleSave,
    handleSaveAs,
    handleSaveProject,
    handleUndo,
    pasteClipboard,
    selectedNote,
    xml,
  ]);

  const handleExportBugReport = useCallback(async (form: {
    title: string;
    whatHappened: string;
    expected: string;
    stepsTried: string;
    includeXml: boolean;
    includeChatTranscript: boolean;
    includeStorageSnapshot: boolean;
  }) => {
    const report = buildBugReportBundle({
      form,
      filename,
      xml,
      chatTranscript,
    });
    const result = await exportBugReportBundle(report);
    recordBugReportEvent('bug-report', 'export', {
      title: form.title || 'Bug report',
      includeXml: form.includeXml,
      includeChatTranscript: form.includeChatTranscript,
      includeStorageSnapshot: form.includeStorageSnapshot,
      target: result.target,
      locationLabel: result.locationLabel,
      archiveName: result.archiveName,
    });
    setBugReportDirectoryLabel(result.locationLabel);
    setBugReportDialogOpen(false);
    window.alert(
      result.target === 'directory'
        ? `Bug bundle saved to ${result.locationLabel}/${result.archiveName}`
        : `Bug bundle downloaded as ${result.archiveName}`,
    );
  }, [chatTranscript, filename, xml]);

  const handleChooseBugReportDirectory = useCallback(async () => {
    const handle = await chooseBugReportDirectoryHandle();
    setBugReportDirectoryLabel(formatBugReportDirectoryLabel(handle));
    recordBugReportEvent('bug-report', 'choose-directory', {
      locationLabel: formatBugReportDirectoryLabel(handle),
    });
  }, []);

  const handleCommandCenterQuerySubmit = useCallback((query: string) => {
    const chord = query.trim();
    if (!looksLikeCommandChordSymbol(chord)) return false;
    const applied = setHarmonyAtSelection(chord);
    if (!applied) {
      recordBugReportEvent('workspace', 'set-chord-symbol-from-command-search-rejected', {
        value: chord,
        reason: selectedNote ? 'no-op' : 'no-selected-note',
      });
      return false;
    }
    recordBugReportEvent('workspace', 'set-chord-symbol-from-command-search', {
      value: chord,
      measureNumber: selectedNote?.measureNumber ?? null,
      staffIndex: selectedNote?.staffIndex ?? null,
      voiceId: selectedNote?.voiceId ?? null,
    });
    return true;
  }, [selectedNote, setHarmonyAtSelection]);

  const commandCenterActions = useMemo<CommandCenterAction[]>(() => {
    const hasScore = Boolean(xml);
    const activeViewMode = session.viewMode ?? 'continuous-vertical';
    const playbackLabel = playbackState === 'playing' && activePlaybackNote ? t('command.play') : playbackState === 'playing' ? t('command.pause') : t('command.play');
    const scoreRequired = t('command.disabled.scoreRequired');
    const coreScoreRequired = t('command.disabled.coreScoreRequired');
    const noteRequired = t('command.disabled.noteRequired');
    const selectionRequired = t('command.disabled.selectionRequired');
    const pitchedNoteRequired = t('command.disabled.pitchedNoteRequired');
    const activeViewReason = t('command.disabled.alreadyActive');
    const hasNoteSelection = Boolean(selectedNote || selectedNotes.length > 0);
    const selectedItemCount = selection.selectionCount || selectedNotes.length || (selectedNote ? 1 : 0);
    const selectedItemDescription = `${selectedItemCount} selected ${selectedItemCount === 1 ? 'item' : 'items'}`;
    const noteSelectionDisabledReason = !hasScore
      ? scoreRequired
      : !hasNoteSelection
        ? noteRequired
        : undefined;
    const pitchedSelectionDisabledReason = !hasScore
      ? scoreRequired
      : !hasNoteSelection
        ? noteRequired
        : selectedNote?.isRest
          ? pitchedNoteRequired
          : undefined;
    const targetMeasure = selectedBarlineMeasureNumber ?? selectedNote?.measureNumber ?? Math.max(currentMeasure, 1);
    const measureSelectionDisabledReason = !hasScore
      ? scoreRequired
      : !selectedNote && !selectedBarlineMeasureNumber
        ? noteRequired
          : undefined;
    const viewGroup = t('command.group.view');
    const inspectorGroup = t('command.group.inspectorSections');
    const paletteGroup = t('command.group.palette');
    const textInputGroup = t('command.group.textInput');
    const textInputKeywords = ['text input', 'inspector text', 'notation text'];

    return [
      {
        id: 'new-score',
        title: t('command.newScore.title'),
        description: t('command.newScore.description'),
        group: t('command.group.file'),
        shortcut: 'Cmd N',
        onRun: handleOpenNewScoreDialog,
      },
      {
        id: 'start-blank-score',
        title: t('command.blank.title'),
        description: t('command.blank.description'),
        group: t('command.group.file'),
        onRun: handleStartBlankScore,
      },
      {
        id: 'open-file',
        title: t('command.open.title'),
        description: t('command.open.description'),
        shortcut: 'Cmd O',
        group: t('command.group.file'),
        onRun: handleOpenFilePicker,
      },
      {
        id: 'save',
        title: 'Save',
        description: 'Save the current score to the local library',
        group: t('command.group.file'),
        shortcut: 'Cmd S',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => { void handleSave(); },
      },
      {
        id: 'save-as',
        title: t('command.saveAs.title'),
        description: t('command.saveAs.description'),
        group: t('command.group.file'),
        shortcut: 'Shift Cmd S',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: handleSaveAs,
      },
      {
        id: 'save-project',
        title: t('command.saveProject.title'),
        description: t('command.saveProject.description'),
        group: t('command.group.file'),
        disabled: !coreDocument,
        disabledReason: !coreDocument ? coreScoreRequired : undefined,
        onRun: handleSaveProject,
      },
      {
        id: 'close-score',
        title: 'Close score',
        description: 'Close the current score and return to the welcome screen',
        group: t('command.group.file'),
        shortcut: 'Cmd W',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: handleCloseScore,
      },
      {
        id: 'export-mxl',
        title: t('command.exportMxl.title'),
        description: t('command.exportMxl.description'),
        group: t('command.group.export'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => { void handleDownload(); },
      },
      {
        id: 'export-abc',
        title: t('command.exportAbc.title'),
        description: t('command.exportAbc.description'),
        group: t('command.group.export'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => { void handleDownloadAbc(); },
      },
      {
        id: 'export-practice-pack',
        title: t('command.exportPractice.title'),
        description: t('command.exportPractice.description'),
        group: t('command.group.export'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => { void handleDownloadPracticePack(); },
      },
      {
        id: 'print-view',
        title: printView ? t('command.printView.return') : t('command.printView.open'),
        description: t('command.printView.description'),
        group: t('command.group.layout'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: handlePrintViewToggle,
      },
      {
        id: 'print-score',
        title: t('command.print.title'),
        description: t('command.print.description'),
        group: t('command.group.layout'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: handlePrintScore,
      },
      {
        id: 'layout-cleanup',
        title: t('command.layout.title'),
        description: t('command.layout.description'),
        group: t('command.group.layout'),
        disabled: !hasScore || layoutCleanupLoading,
        disabledReason: !hasScore
          ? scoreRequired
          : layoutCleanupLoading
            ? t('command.disabled.layoutLoading')
            : undefined,
        onRun: () => { void handleLayoutCleanup(); },
      },
      {
        id: 'toggle-navigator',
        title: t('command.navigator.title'),
        description: t('command.navigator.description'),
        group: viewGroup,
        keywords: ['minimap', 'overview', 'score map'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('toggle-navigator'),
      },
      {
        id: 'focus-find',
        title: t('command.find.title'),
        description: t('command.find.description'),
        group: viewGroup,
        keywords: ['goto', 'go to', 'measure search', 'page search', 'rehearsal'],
        shortcut: 'Cmd F',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('focus-find'),
      },
      {
        id: 'zoom-in',
        title: t('command.zoomIn.title'),
        description: t('command.zoom.description'),
        group: viewGroup,
        shortcut: 'Cmd +',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('zoom-in'),
      },
      {
        id: 'zoom-out',
        title: t('command.zoomOut.title'),
        description: t('command.zoom.description'),
        group: viewGroup,
        shortcut: 'Cmd -',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('zoom-out'),
      },
      {
        id: 'zoom-reset',
        title: t('command.zoomReset.title'),
        description: t('command.zoom.description'),
        group: viewGroup,
        shortcut: 'Cmd 0',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('zoom-reset'),
      },
      {
        id: 'view-page',
        title: t('command.view.page.title'),
        description: t('command.view.page.description'),
        group: viewGroup,
        keywords: ['page preview', 'paper'],
        disabled: !hasScore || activeViewMode === 'page',
        disabledReason: !hasScore
          ? scoreRequired
          : activeViewMode === 'page'
            ? activeViewReason
            : undefined,
        onRun: () => dispatchScoreViewCommand('set-view-mode', 'page'),
      },
      {
        id: 'view-continuous-vertical',
        title: t('command.view.continuousVertical.title'),
        description: t('command.view.continuousVertical.description'),
        group: viewGroup,
        keywords: ['vertical scroll', 'continuous'],
        disabled: !hasScore || activeViewMode === 'continuous-vertical',
        disabledReason: !hasScore
          ? scoreRequired
          : activeViewMode === 'continuous-vertical'
            ? activeViewReason
            : undefined,
        onRun: () => dispatchScoreViewCommand('set-view-mode', 'continuous-vertical'),
      },
      {
        id: 'view-continuous-horizontal',
        title: t('command.view.continuousHorizontal.title'),
        description: t('command.view.continuousHorizontal.description'),
        group: viewGroup,
        keywords: ['horizontal scroll', 'filmstrip'],
        disabled: !hasScore || activeViewMode === 'continuous-horizontal',
        disabledReason: !hasScore
          ? scoreRequired
          : activeViewMode === 'continuous-horizontal'
            ? activeViewReason
            : undefined,
        onRun: () => dispatchScoreViewCommand('set-view-mode', 'continuous-horizontal'),
      },
      {
        id: 'playback-toggle',
        title: playbackLabel,
        description: t('command.play.description'),
        group: t('command.group.playback'),
        shortcut: 'Space',
        disabled: !hasScore || midiLoading,
        disabledReason: !hasScore
          ? scoreRequired
          : midiLoading
            ? t('command.disabled.midiLoading')
            : undefined,
        onRun: () => {
          if (playbackState === 'playing' && !activePlaybackNote) {
            pause();
            return;
          }
          void handlePlay();
        },
      },
      {
        id: 'stop-playback',
        title: t('command.stop.title'),
        description: t('command.stop.description'),
        group: t('command.group.playback'),
        disabled: !hasScore || playbackState === 'stopped',
        disabledReason: !hasScore
          ? scoreRequired
          : playbackState === 'stopped'
            ? t('command.disabled.alreadyStopped')
            : undefined,
        onRun: stop,
      },
      {
        id: 'toggle-metronome',
        title: metronomeEnabled ? t('command.metronome.off') : t('command.metronome.on'),
        description: t('command.metronome.description'),
        group: t('command.group.playback'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => setMetronomeEnabled((value) => !value),
      },
      {
        id: 'toggle-note-input',
        title: noteInputMode ? t('command.noteInput.exit') : t('command.noteInput.enter'),
        description: t('command.noteInput.description'),
        group: t('command.group.noteInput'),
        shortcut: 'N',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: toggleNoteInput,
      },
      {
        id: 'toggle-chord-input',
        title: chordInputMode ? t('command.chord.off') : t('command.chord.on'),
        description: t('command.chord.description'),
        group: t('command.group.noteInput'),
        shortcut: 'Shift Cmd H',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: toggleChordInputMode,
      },
      {
        id: 'focus-chord-symbol',
        title: t('command.chordSymbol.title'),
        description: t('command.chordSymbol.description'),
        group: textInputGroup,
        keywords: [...textInputKeywords, 'chord symbol', 'harmony'],
        shortcut: 'Cmd K',
        disabled: !selectedNote,
        disabledReason: !hasScore ? scoreRequired : !selectedNote ? noteRequired : undefined,
        onRun: () => window.dispatchEvent(new CustomEvent('nex-note:focus-inline-chord-symbol')),
      },
      {
        id: 'focus-staff-text',
        title: t('command.staffText.title'),
        description: t('command.staffText.description'),
        group: textInputGroup,
        keywords: [...textInputKeywords, 'staff text', 'expression'],
        shortcut: 'Cmd T',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('staff-text'),
      },
      {
        id: 'focus-rehearsal-mark',
        title: t('command.rehearsalMark.title'),
        description: t('command.rehearsalMark.description'),
        group: textInputGroup,
        keywords: [...textInputKeywords, 'rehearsal mark'],
        shortcut: 'Cmd M',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('rehearsal-mark'),
      },
      {
        id: 'focus-lyric-line',
        title: t('command.lyricLine.title'),
        description: t('command.lyricLine.description'),
        group: textInputGroup,
        keywords: [...textInputKeywords, 'lyrics', 'lyric line'],
        disabled: !selectedNote,
        disabledReason: !hasScore ? scoreRequired : !selectedNote ? noteRequired : undefined,
        onRun: () => focusInspectorTarget('lyric'),
      },
      {
        id: 'focus-dynamic-marking',
        title: t('command.dynamicInput.title'),
        description: t('command.dynamicInput.description'),
        group: textInputGroup,
        keywords: [...textInputKeywords, 'dynamic marking', 'dynamics'],
        disabled: !selectedNote,
        disabledReason: !hasScore ? scoreRequired : !selectedNote ? noteRequired : undefined,
        onRun: () => focusInspectorTarget('dynamic'),
      },
      {
        id: 'open-palette-selection',
        title: t('command.palette.selection.title'),
        description: t('command.palette.selection.description'),
        group: paletteGroup,
        keywords: ['edit palette section palette selection tools palette clipboard'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusEditPaletteSection('selection'),
      },
      {
        id: 'open-palette-transpose',
        title: t('command.palette.transpose.title'),
        description: t('command.palette.transpose.description'),
        group: paletteGroup,
        keywords: ['edit palette transpose semitone octave pitch'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusEditPaletteSection('transpose'),
      },
      {
        id: 'open-palette-articulations',
        title: t('command.palette.articulations.title'),
        description: t('command.palette.articulations.description'),
        group: paletteGroup,
        keywords: ['edit palette articulations staccato accent tenuto fermata'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusEditPaletteSection('articulations'),
      },
      {
        id: 'open-palette-dynamics',
        title: t('command.palette.dynamics.title'),
        description: t('command.palette.dynamics.description'),
        group: paletteGroup,
        keywords: ['edit palette dynamics pp mf ff sfz'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusEditPaletteSection('dynamics'),
      },
      {
        id: 'open-palette-ties',
        title: t('command.palette.ties.title'),
        description: t('command.palette.ties.description'),
        group: paletteGroup,
        keywords: ['edit palette ties slurs tie slur phrasing'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusEditPaletteSection('ties'),
      },
      {
        id: 'open-palette-barlines',
        title: t('command.palette.barlines.title'),
        description: t('command.palette.barlines.description'),
        group: paletteGroup,
        keywords: ['edit palette barlines repeat final double measure ending'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusEditPaletteSection('barlines'),
      },
      {
        id: 'open-inspector-selection',
        title: t('command.inspector.selection.title'),
        description: t('command.inspector.selection.description'),
        group: inspectorGroup,
        keywords: ['selection inspector', 'range tools', 'batch edit'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('selection'),
      },
      {
        id: 'open-inspector-score-setup',
        title: t('command.inspector.scoreSetup.title'),
        description: t('command.inspector.scoreSetup.description'),
        group: inspectorGroup,
        keywords: ['metadata', 'title composer arranger subtitle'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('score-setup'),
      },
      {
        id: 'open-inspector-key',
        title: t('command.inspector.key.title'),
        description: t('command.inspector.key.description'),
        group: inspectorGroup,
        keywords: ['key signature tonality accidentals'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('key'),
      },
      {
        id: 'open-inspector-time-clef',
        title: t('command.inspector.timeClef.title'),
        description: t('command.inspector.timeClef.description'),
        group: inspectorGroup,
        keywords: ['time signature clef meter'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('time-clef'),
      },
      {
        id: 'open-inspector-text-rehearsal',
        title: t('command.inspector.textRehearsal.title'),
        description: t('command.inspector.textRehearsal.description'),
        group: inspectorGroup,
        keywords: ['staff text rehearsal expression words'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('text-rehearsal'),
      },
      {
        id: 'open-inspector-lyrics',
        title: t('command.inspector.lyrics.title'),
        description: t('command.inspector.lyrics.description'),
        group: inspectorGroup,
        keywords: ['lyrics verse syllable'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('lyrics'),
      },
      {
        id: 'open-inspector-parts',
        title: t('command.inspector.parts.title'),
        description: t('command.inspector.parts.description'),
        group: inspectorGroup,
        keywords: ['parts instruments transposition extraction layout presets'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('parts'),
      },
      {
        id: 'fill-slash-measure',
        title: t('command.slashes.title'),
        description: t('command.slashes.description'),
        group: t('command.group.noteInput'),
        shortcut: 'Cmd /',
        disabled: !selectedNote,
        disabledReason: !hasScore ? scoreRequired : !selectedNote ? noteRequired : undefined,
        onRun: fillSlashMeasure,
      },
      {
        id: 'insert-rest',
        title: t('command.rest.title'),
        description: t('command.rest.description'),
        group: t('command.group.noteInput'),
        shortcut: 'R',
        disabled: !selectedNote,
        disabledReason: !hasScore ? scoreRequired : !selectedNote ? noteRequired : undefined,
        onRun: insertRest,
      },
      ...COMMAND_CENTER_VOICE_ACTIONS.map((action) => ({
        id: action.id,
        title: t('command.voice.title', { voice: action.voice }),
        description: selectedVoice === action.voice
          ? t('command.voice.activeDescription', { voice: action.voice })
          : t('command.voice.description', { voice: action.voice }),
        group: t('command.group.noteInput'),
        shortcut: action.shortcut,
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => setVoice(action.voice),
      })),
      ...COMMAND_CENTER_TRANSPOSE_ACTIONS.map((action) => ({
        id: action.id,
        title: t(action.titleKey),
        description: t('command.transpose.description'),
        group: t('command.group.selectionEdits'),
        shortcut: 'shortcut' in action ? action.shortcut : undefined,
        disabled: Boolean(pitchedSelectionDisabledReason),
        disabledReason: pitchedSelectionDisabledReason,
        onRun: () => transposeSemitones(action.semitones),
      })),
      {
        id: 'toggle-tie',
        title: t('command.tie.title'),
        description: t('command.tie.description'),
        group: t('command.group.selectionEdits'),
        shortcut: 'T',
        disabled: Boolean(pitchedSelectionDisabledReason),
        disabledReason: pitchedSelectionDisabledReason,
        onRun: toggleTie,
      },
      {
        id: 'toggle-slur',
        title: t('command.slur.title'),
        description: t('command.slur.description'),
        group: t('command.group.selectionEdits'),
        shortcut: 'S',
        disabled: Boolean(pitchedSelectionDisabledReason),
        disabledReason: pitchedSelectionDisabledReason,
        onRun: toggleSlur,
      },
      ...COMMAND_CENTER_ARTICULATION_ACTIONS.map((action) => ({
        id: action.id,
        title: t(action.titleKey),
        description: t('command.articulation.description'),
        group: t('command.group.articulations'),
        shortcut: action.shortcut,
        disabled: Boolean(pitchedSelectionDisabledReason),
        disabledReason: pitchedSelectionDisabledReason,
        onRun: () => toggleArticulation(action.articulation),
      })),
      ...COMMAND_CENTER_DYNAMIC_ACTIONS.map((action) => ({
        id: action.id,
        title: t(action.titleKey),
        description: t('command.dynamic.description'),
        group: t('command.group.dynamics'),
        disabled: Boolean(noteSelectionDisabledReason),
        disabledReason: noteSelectionDisabledReason,
        onRun: () => addDynamic(action.dynamic),
      })),
      ...COMMAND_CENTER_BARLINE_ACTIONS.map((action) => ({
        id: action.id,
        title: t(action.titleKey),
        description: t('command.barline.description'),
        group: t('command.group.barlines'),
        disabled: Boolean(measureSelectionDisabledReason),
        disabledReason: measureSelectionDisabledReason,
        onRun: () => setBarlineAtSelection(action.barline),
      })),
      ...COMMAND_CENTER_STRUCTURE_ACTIONS.map((action) => ({
        id: action.id,
        title: t(action.titleKey),
        description: t(action.descriptionKey, { measure: targetMeasure }),
        group: t('command.group.structure'),
        keywords: ['measure structure', 'repeat ending', 'inspector measure', ...action.keywords],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => handleApplyCommands(action.buildCommands(targetMeasure), action.label),
      })),
      {
        id: 'open-inspector-repeats-endings',
        title: t('command.inspector.repeatsEndings.title'),
        description: t('command.inspector.repeatsEndings.description'),
        group: t('command.group.structure'),
        keywords: ['structure inspector repeat ending volta measure workflow'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('repeats-endings'),
      },
      {
        id: 'open-inspector-measure',
        title: t('command.inspector.measure.title'),
        description: t('command.inspector.measure.description'),
        group: t('command.group.structure'),
        keywords: ['structure inspector measure tools insert delete system break page break spacing'],
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => focusInspectorTarget('measure'),
      },
      {
        id: 'duplicate-selection',
        title: t('command.duplicate.title'),
        description: selectedItemDescription,
        group: t('command.group.selectionEdits'),
        shortcut: 'Cmd D',
        disabled: !selectedNote && selectedNotes.length === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote && selectedNotes.length === 0
            ? selectionRequired
            : undefined,
        onRun: duplicateSelection,
      },
      {
        id: 'delete-selection',
        title: selectedMeasureNumbers.length ? t('command.delete.measures') : t('command.delete.note'),
        description: selectedMeasureNumbers.length
          ? `${selectedMeasureNumbers.length} selected ${selectedMeasureNumbers.length === 1 ? 'measure' : 'measures'}`
          : t('command.delete.description'),
        group: t('command.group.notation'),
        shortcut: 'Del',
        disabled: !selectedNote && selectedMeasureNumbers.length === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote && selectedMeasureNumbers.length === 0
            ? selectionRequired
            : undefined,
        onRun: handleDeleteSelection,
      },
      {
        id: 'clear-selection',
        title: t('command.clear.title'),
        description: selectedItemDescription,
        group: t('command.group.notation'),
        disabled: selection.selectionCount === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : selection.selectionCount === 0
            ? selectionRequired
            : undefined,
        onRun: clearSelection,
      },
      {
        id: 'copy-selection',
        title: t('command.copy.title'),
        description: selectedItemDescription,
        group: t('command.group.clipboard'),
        shortcut: 'Cmd C',
        disabled: !selectedNote && selection.selectionCount === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote && selection.selectionCount === 0
            ? selectionRequired
            : undefined,
        onRun: copySelection,
      },
      {
        id: 'cut-selection',
        title: t('command.cut.title'),
        description: selectedItemDescription,
        group: t('command.group.clipboard'),
        shortcut: 'Cmd X',
        disabled: !selectedNote && selection.selectionCount === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote && selection.selectionCount === 0
            ? selectionRequired
            : undefined,
        onRun: cutSelection,
      },
      {
        id: 'paste-selection',
        title: t('command.paste.title'),
        description: `${clipboardCount} copied event(s)`,
        group: t('command.group.clipboard'),
        shortcut: 'Cmd V',
        disabled: !selectedNote || clipboardCount === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote
          ? noteRequired
          : clipboardCount === 0
            ? t('command.disabled.clipboardEmpty')
            : undefined,
        onRun: pasteClipboard,
      },
      {
        id: 'undo',
        title: t('command.undo.title'),
        description: t('command.undo.description'),
        group: t('command.group.history'),
        shortcut: 'Cmd Z',
        disabled: !hasScore || !canUndo,
        disabledReason: !hasScore
          ? scoreRequired
          : !canUndo
            ? t('command.disabled.undoEmpty')
            : undefined,
        onRun: handleUndo,
      },
      {
        id: 'redo',
        title: t('command.redo.title'),
        description: t('command.redo.description'),
        group: t('command.group.history'),
        shortcut: 'Shift Cmd Z',
        disabled: !hasScore || !canRedo,
        disabledReason: !hasScore
          ? scoreRequired
          : !canRedo
            ? t('command.disabled.redoEmpty')
            : undefined,
        onRun: handleRedo,
      },
      {
        id: 'assistant-panel',
        title: t('command.assistant.title'),
        description: t('command.assistant.description'),
        group: t('command.group.workspace'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => {
          setSidebarCollapsed(false);
          setWorkspaceTab('assistant');
        },
      },
      {
        id: 'library-panel',
        title: t('command.library.title'),
        description: t('command.library.description'),
        group: t('command.group.workspace'),
        onRun: () => {
          setSidebarCollapsed(false);
          setWorkspaceTab('library');
        },
      },
      {
        id: 'inspector-panel',
        title: t('command.inspector.title'),
        description: t('command.inspector.description'),
        group: t('command.group.workspace'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => {
          setSidebarCollapsed(false);
          setWorkspaceTab('inspector');
        },
      },
    ];
  }, [
    canRedo,
    canUndo,
    activePlaybackNote,
    chordInputMode,
    clearSelection,
    coreDocument,
    clipboardCount,
    copySelection,
    addDynamic,
    dispatchScoreViewCommand,
    duplicateSelection,
    handleDownload,
    handleDownloadAbc,
    handleDownloadPracticePack,
    handleDeleteSelection,
    handleLayoutCleanup,
    handleCloseScore,
    handleApplyCommands,
    handleOpenFilePicker,
    handleOpenNewScoreDialog,
    handlePlay,
    handlePrintScore,
    handlePrintViewToggle,
    handleRedo,
    handleSave,
    handleSaveAs,
    handleSaveProject,
    handleStartBlankScore,
    handleUndo,
    insertRest,
    fillSlashMeasure,
    focusEditPaletteSection,
    focusInspectorTarget,
    layoutCleanupLoading,
    metronomeEnabled,
    midiLoading,
    noteInputMode,
    pause,
    pasteClipboard,
    playbackState,
    printView,
    currentMeasure,
    selectedBarlineMeasureNumber,
    selectedMeasureNumbers,
    selectedNote,
    selectedNotes.length,
    selection.selectionCount,
    session.viewMode,
    setBarlineAtSelection,
    setVoice,
    stop,
    t,
    toggleArticulation,
    toggleChordInputMode,
    toggleSlur,
    toggleTie,
    toggleNoteInput,
    transposeSemitones,
    xml,
  ]);

  const fileMenuItems = useMemo<FileMenuItem[]>(() => {
    const hasScore = Boolean(xml);
    const scoreRequired = t('command.disabled.scoreRequired');
    const coreScoreRequired = t('command.disabled.coreScoreRequired');
    return [
      {
        id: 'new',
        label: t('app.newFile'),
        shortcut: 'Cmd N',
        onRun: handleOpenNewScoreDialog,
      },
      {
        id: 'open',
        label: t('app.openFile'),
        shortcut: 'Cmd O',
        onRun: handleOpenFilePicker,
      },
      {
        id: 'save',
        label: 'Save',
        shortcut: 'Cmd S',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        separatorBefore: true,
        onRun: handleSave,
      },
      {
        id: 'save-as',
        label: t('app.saveAs'),
        shortcut: 'Shift Cmd S',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: handleSaveAs,
      },
      {
        id: 'save-project',
        label: t('app.saveProject'),
        disabled: !coreDocument,
        disabledReason: !coreDocument ? coreScoreRequired : undefined,
        onRun: handleSaveProject,
      },
      {
        id: 'export-mxl',
        label: t('app.downloadMxl'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        separatorBefore: true,
        onRun: () => { void handleDownload(); },
      },
      {
        id: 'export-abc',
        label: t('app.exportAbc'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => { void handleDownloadAbc(); },
      },
      {
        id: 'export-practice',
        label: t('app.exportPracticePack'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => { void handleDownloadPracticePack(); },
      },
      {
        id: 'print',
        label: t('app.printScore'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        separatorBefore: true,
        onRun: handlePrintScore,
      },
      {
        id: 'close',
        label: 'Close score',
        shortcut: 'Cmd W',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        danger: true,
        separatorBefore: true,
        onRun: handleCloseScore,
      },
    ];
  }, [
    coreDocument,
    handleCloseScore,
    handleDownload,
    handleDownloadAbc,
    handleDownloadPracticePack,
    handleOpenFilePicker,
    handleOpenNewScoreDialog,
    handlePrintScore,
    handleSave,
    handleSaveAs,
    handleSaveProject,
    t,
    xml,
  ]);

  const editMenuItems = useMemo<FileMenuItem[]>(() => {
    const hasScore = Boolean(xml);
    const scoreRequired = t('command.disabled.scoreRequired');
    const noteRequired = t('command.disabled.noteRequired');
    const selectionRequired = t('command.disabled.selectionRequired');
    const hasSelection = Boolean(selectedNote || selectedNotes.length > 0 || selection.selectionCount > 0);

    return [
      {
        id: 'undo',
        label: t('command.undo.title'),
        shortcut: 'Cmd Z',
        disabled: !hasScore || !canUndo,
        disabledReason: !hasScore
          ? scoreRequired
          : !canUndo
            ? t('command.disabled.undoEmpty')
            : undefined,
        onRun: handleUndo,
      },
      {
        id: 'redo',
        label: t('command.redo.title'),
        shortcut: 'Shift Cmd Z',
        disabled: !hasScore || !canRedo,
        disabledReason: !hasScore
          ? scoreRequired
          : !canRedo
            ? t('command.disabled.redoEmpty')
            : undefined,
        onRun: handleRedo,
      },
      {
        id: 'copy',
        label: t('command.copy.title'),
        shortcut: 'Cmd C',
        disabled: !hasSelection,
        disabledReason: !hasScore
          ? scoreRequired
          : !hasSelection
            ? selectionRequired
            : undefined,
        separatorBefore: true,
        onRun: copySelection,
      },
      {
        id: 'cut',
        label: t('command.cut.title'),
        shortcut: 'Cmd X',
        disabled: !hasSelection,
        disabledReason: !hasScore
          ? scoreRequired
          : !hasSelection
            ? selectionRequired
            : undefined,
        onRun: cutSelection,
      },
      {
        id: 'paste',
        label: t('command.paste.title'),
        shortcut: 'Cmd V',
        disabled: !selectedNote || clipboardCount === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote
            ? noteRequired
            : clipboardCount === 0
              ? t('command.disabled.clipboardEmpty')
              : undefined,
        onRun: pasteClipboard,
      },
      {
        id: 'duplicate',
        label: t('command.duplicate.title'),
        shortcut: 'Cmd D',
        disabled: !hasSelection,
        disabledReason: !hasScore
          ? scoreRequired
          : !hasSelection
            ? selectionRequired
            : undefined,
        onRun: duplicateSelection,
      },
      {
        id: 'delete',
        label: selectedMeasureNumbers.length ? t('command.delete.measures') : t('command.delete.note'),
        shortcut: 'Del',
        disabled: !selectedNote && selectedMeasureNumbers.length === 0,
        disabledReason: !hasScore
          ? scoreRequired
          : !selectedNote && selectedMeasureNumbers.length === 0
            ? selectionRequired
            : undefined,
        onRun: handleDeleteSelection,
      },
      {
        id: 'clear-selection',
        label: t('command.clear.title'),
        disabled: !hasSelection,
        disabledReason: !hasScore
          ? scoreRequired
          : !hasSelection
            ? selectionRequired
            : undefined,
        onRun: clearSelection,
      },
    ];
  }, [
    canRedo,
    canUndo,
    clearSelection,
    clipboardCount,
    copySelection,
    cutSelection,
    duplicateSelection,
    handleDeleteSelection,
    handleRedo,
    handleUndo,
    pasteClipboard,
    selectedMeasureNumbers.length,
    selectedNote,
    selectedNotes.length,
    t,
    xml,
  ]);

  const viewMenuItems = useMemo<FileMenuItem[]>(() => {
    const hasScore = Boolean(xml);
    const activeViewMode = session.viewMode ?? 'continuous-vertical';
    const scoreRequired = t('command.disabled.scoreRequired');
    const activeViewReason = t('command.disabled.alreadyActive');

    return [
      {
        id: 'focus-find',
        label: t('command.find.title'),
        shortcut: 'Cmd F',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('focus-find'),
      },
      {
        id: 'toggle-navigator',
        label: t('command.navigator.title'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('toggle-navigator'),
      },
      {
        id: 'zoom-in',
        label: t('command.zoomIn.title'),
        shortcut: 'Cmd +',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        separatorBefore: true,
        onRun: () => dispatchScoreViewCommand('zoom-in'),
      },
      {
        id: 'zoom-out',
        label: t('command.zoomOut.title'),
        shortcut: 'Cmd -',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('zoom-out'),
      },
      {
        id: 'zoom-reset',
        label: t('command.zoomReset.title'),
        shortcut: 'Cmd 0',
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: () => dispatchScoreViewCommand('zoom-reset'),
      },
      {
        id: 'view-page',
        label: t('command.view.page.title'),
        disabled: !hasScore || activeViewMode === 'page',
        disabledReason: !hasScore
          ? scoreRequired
          : activeViewMode === 'page'
            ? activeViewReason
            : undefined,
        separatorBefore: true,
        onRun: () => dispatchScoreViewCommand('set-view-mode', 'page'),
      },
      {
        id: 'view-continuous-vertical',
        label: t('command.view.continuousVertical.title'),
        disabled: !hasScore || activeViewMode === 'continuous-vertical',
        disabledReason: !hasScore
          ? scoreRequired
          : activeViewMode === 'continuous-vertical'
            ? activeViewReason
            : undefined,
        onRun: () => dispatchScoreViewCommand('set-view-mode', 'continuous-vertical'),
      },
      {
        id: 'view-continuous-horizontal',
        label: t('command.view.continuousHorizontal.title'),
        disabled: !hasScore || activeViewMode === 'continuous-horizontal',
        disabledReason: !hasScore
          ? scoreRequired
          : activeViewMode === 'continuous-horizontal'
            ? activeViewReason
            : undefined,
        onRun: () => dispatchScoreViewCommand('set-view-mode', 'continuous-horizontal'),
      },
      {
        id: 'print-view',
        label: printView ? t('app.editView') : t('app.printView'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        separatorBefore: true,
        onRun: handlePrintViewToggle,
      },
      {
        id: 'print-score',
        label: t('app.printScore'),
        disabled: !hasScore,
        disabledReason: !hasScore ? scoreRequired : undefined,
        onRun: handlePrintScore,
      },
    ];
  }, [
    dispatchScoreViewCommand,
    handlePrintScore,
    handlePrintViewToggle,
    printView,
    session.viewMode,
    t,
    xml,
  ]);

  const scoreOnlyEmbed = embedConfig.enabled && embedConfig.scoreOnly;
  const renderScoreEditor = (viewOnly = false) => (
    <ScoreEditor
      xml={deferredXml}
      coreDocument={deferredCoreDocument}
      diagnostics={diagnostics}
      editorError={editorError}
      noteInputAnchor={viewOnly ? null : noteInputAnchor}
      selectedNote={viewOnly ? null : selectedNote}
      selectedNotes={viewOnly ? [] : selectedNotes}
      noteInputMode={viewOnly ? false : noteInputMode}
      inputByDurationMode={viewOnly ? false : inputByDurationMode}
      preparedDurationActivePitch={viewOnly ? null : preparedDurationActivePitch}
      selectedDuration={selectedDuration}
      selectedAccidental={selectedAccidental}
      isDotted={isDotted}
      selectedVoice={selectedVoice}
      entryMode={entryMode}
      chordInputMode={viewOnly ? false : chordInputMode}
      currentMeasure={currentMeasure}
      playbackState={playbackState}
      playbackActive={viewOnly ? false : playbackState === 'playing'}
      playbackCursorTarget={viewOnly ? null : playbackCursorTarget}
      playbackPlayhead={viewOnly ? null : playhead}
      followPlayback={!viewOnly}
      onNoteClick={viewOnly ? () => undefined : handleScoreNoteClick}
      pencilOnlyInput={(pencilInputDevice || pencilFocus) && noteInputMode && !printView}
      onPlaceNoteAt={viewOnly ? () => undefined : placeNoteAt}
      onSetChordSymbol={viewOnly ? undefined : setHarmonyAtSelection}
      onSetGuitarFret={viewOnly ? undefined : setGuitarFretAtNote}
      onPlaybackSeekRequest={viewOnly ? undefined : (target) => { void seekToCursorTarget(target); }}
      dragTransposeMode={transposeMode}
      onDragTransposeCommit={viewOnly ? undefined : ({ note, step, alter, octave }) => commitDraggedPitch({ note, step, alter, octave })}
      onDragPitchPreview={viewOnly ? undefined : previewNote}
      onDirectEntryPitchPreview={viewOnly || !inputAuditionEnabled ? undefined : previewNote}
      onDragStringCommit={viewOnly ? undefined : ({ note, string, fret }) => commitDraggedGuitarString({ note, string, fret })}
      onMeasureSelectionChange={viewOnly ? undefined : handleMeasureSelectionChange}
      clearMeasureSelectionSignal={clearMeasureSelectionSignal}
      sessionViewMode={session.viewMode}
      sessionZoomPercent={session.zoomPercent}
      onSessionViewModeChange={(viewMode) => updateSession({ viewMode })}
      onSessionZoomPercentChange={(zoomPercent) => updateSession({ zoomPercent })}
      onRenderStart={handleScoreRenderStart}
      onRenderError={handleScoreRenderError}
      semanticGridReady={!importLifecycle.deferred || ['debugGridReady', 'midiReady'].includes(importLifecycle.phase)}
      onOsmdReady={handleOsmdReady}
    />
  );

  if (embedConfig.enabled && embedStartup.phase === 'error') {
    return (
      <EmbedStartupScreen phase="error" message={embedStartup.message} />
    );
  }

  if (embedConfig.enabled && embedStartup.phase !== 'ready') {
    return (
      <EmbedStartupScreen phase={embedStartup.phase} message={embedStartup.message}>
        {xml ? (
          <div className="h-full w-full overflow-hidden bg-nex-score-bg">
            {renderScoreEditor(scoreOnlyEmbed)}
          </div>
        ) : null}
      </EmbedStartupScreen>
    );
  }

  if (scoreOnlyEmbed) {
    return (
      <div className="nex-score-only-embed h-screen w-screen overflow-hidden bg-nex-score-bg" data-testid="score-only-embed">
        {renderScoreEditor(true)}
      </div>
    );
  }

  const pencilFocusActive = pencilFocus && noteInputMode && !printView;

  return (
    <div data-pencil-focus={pencilFocusActive ? "true" : "false"} className={`nex-app-shell h-screen bg-nex-surface flex flex-col overflow-hidden ${printView ? 'nex-print-view' : ''}`}>
      <CommandCenter
        open={commandCenterOpen}
        actions={commandCenterActions}
        onClose={() => setCommandCenterOpen(false)}
        onSubmitQuery={handleCommandCenterQuerySubmit}
      />
      <NewScoreDialog
        open={newScoreDialogOpen}
        initialTab={newScoreInitialTab}
        onClose={() => setNewScoreDialogOpen(false)}
        onCreate={handleCreateNewScore}
        userTemplates={userTemplates}
        userTemplateStatus={userTemplateStatus}
        onChooseUserTemplate={handleChooseUserTemplate}
        onImportTemplateFile={handleImportTemplateFile}
      />
      <BugReportDialog
        open={bugReportDialogOpen}
        filename={filename}
        directorySupported={supportsBugReportDirectoryExport()}
        directoryLabel={bugReportDirectoryLabel}
        onChooseDirectory={handleChooseBugReportDirectory}
        onClose={() => setBugReportDialogOpen(false)}
        onExport={handleExportBugReport}
      />
      {activeStatus && (
        <div
          className={`nex-workspace-status pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg border px-4 py-3 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.85)] backdrop-blur ${
            activeStatusIsError
              ? 'border-red-200 bg-red-50/95'
              : 'border-slate-200 bg-white/95'
          }`}
          data-testid={activeStatusIsError ? 'embed-error' : 'embed-status'}
        >
          <div className="flex items-center gap-3">
            {activeStatusIsLoading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
            )}
            <div>
              <p className={`text-sm font-medium ${activeStatusIsError ? 'text-red-700' : 'text-slate-700'}`}>{activeStatus}</p>
              {importStatus.includes('AI Assist') && (
                <p className="mt-0.5 text-xs text-slate-500">This can take a little longer for MIDI files.</p>
              )}
            </div>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        multiple
        className="hidden"
        style={{ caretColor: 'transparent' }}
        suppressHydrationWarning
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;

          await handleSelectedFiles(files);
        }}
      />
      {/* Header */}
      <header className="nex-brand-toolbar border-b px-5 h-14 flex items-center gap-3 shrink-0" data-testid="app-header">
        {/* Logo + name */}
        <NexNoteBrand compact className="shrink-0" />

        {/* Filename */}
        {xml && filename && (
          <>
            <div className="w-px h-5 bg-nex-border shrink-0" />
            <span className="text-xs font-medium text-slate-500 max-w-[240px] truncate shrink-0" title={filename}>
              {filename}
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* Provider selector */}
        <div data-testid="provider-selector">
          <ProviderSelector
            provider={provider}
            ollamaModel={ollamaModel}
            onProviderChange={setProvider}
            onModelChange={handleOllamaModelChange}
            providerOptions={providerOptions}
            ollamaModels={aiModelSettings.providers.ollama.models}
            onOllamaModelsChange={handleOllamaModelsChange}
            compact
          />
        </div>
        <AiModelSettingsPanel
          settings={aiModelSettings}
          onSettingsChange={handleAiModelSettingsChange}
          onProviderChange={setProvider}
          onOllamaModelChange={handleOllamaModelChange}
          liveOllamaModels={ollamaModels}
          openSignal={aiSettingsOpenSignal}
        />
        <LanguageSettings />

        {debugMode && (
          <>
            <div className="w-px h-5 bg-nex-border shrink-0" />
            <button
              onClick={() => {
                setBugReportDialogOpen(true);
                recordBugReportEvent('bug-report', 'open-dialog', {
                  filename,
                });
              }}
              title={t('app.reportBug')}
              className="h-8 rounded-md bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 hover:text-rose-900"
            >
              {t('app.reportBug')}
            </button>
          </>
        )}

        <div className="w-px h-5 bg-nex-border shrink-0" />

        {/* File actions */}
        <div role="menubar" aria-label="Score menus" className="nex-electron-hidden flex items-center gap-2">
          <FileMenu menuId="file" label={t('command.group.file')} items={fileMenuItems} />
          <FileMenu menuId="edit" label={t('app.editMenu')} items={editMenuItems} />
          <FileMenu menuId="view" label={t('app.viewMenu')} items={viewMenuItems} />
        </div>
        <button
          onClick={() => {
            setCommandCenterOpen(true);
            recordBugReportEvent('workspace', 'open-command-center', {
              source: 'header',
            });
          }}
          title={formatShortcutHint(`${t('app.searchCommands')} (Cmd/Ctrl+K)`)}
          className="nex-header-command-center hidden h-8 items-center gap-2 rounded-md border border-nex-border bg-nex-surface px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-nex-ink sm:flex"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
          </svg>
          {t('app.searchCommands')}
          <kbd className="rounded border border-nex-border bg-white px-1 py-0.5 text-[10px] text-slate-400">{formatShortcutHint('Cmd+K')}</kbd>
        </button>
        <button
          onClick={handleOpenFilePicker}
          title={t('app.openFile')}
          className="nex-electron-hidden nex-brand-button h-8 rounded-md px-2.5 text-xs font-semibold transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span className="nex-header-action-label hidden sm:inline">{t('app.openFile')}</span>
          </span>
        </button>
        <button
          onClick={() => { setWorkspaceTab('library'); setSidebarCollapsed(false); setPencilFocus(false); }}
          title={t('app.library')}
          className={`h-8 rounded-md px-2.5 text-xs font-semibold transition-colors ${
            workspaceTab === 'library'
              ? 'nex-brand-active'
              : 'nex-brand-button'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="nex-header-action-label hidden sm:inline">{t('app.library')}</span>
          </span>
        </button>
        {xml && (
          <span className="contents nex-electron-hidden">
            <button
              onClick={handlePrintViewToggle}
              title={printView ? t('app.editView') : t('app.printView')}
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                printView
                  ? 'nex-brand-active'
                  : 'nex-brand-button'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8V5a2 2 0 012-2h6a2 2 0 012 2v3M7 16H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 12h10v9H7v-9z" />
              </svg>
            </button>
            <button onClick={handlePrintScore} title={t('app.printScore')} className="nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V4h12v5M6 18h12v2H6z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 14H5a2 2 0 01-2-2v-1a3 3 0 013-3h12a3 3 0 013 3v1a2 2 0 01-2 2h-1" />
              </svg>
            </button>
            <button onClick={handleSaveAs} title={t('app.saveAs')} className="nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
            <button onClick={handleSaveProject} title={t('app.saveProject')} className="nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h11l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 4v6h8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 14h8M8 18h5" />
              </svg>
            </button>
            <button onClick={handleDownloadAbc} title={t('app.exportAbc')} className="nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button onClick={handleDownloadPracticePack} title={t('app.exportPracticePack')} className="nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h10" />
              </svg>
            </button>
            <button onClick={handleDownload} title={t('app.downloadMxl')} className="nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </span>
        )}
        <button onClick={() => handleOpenNewScoreDialog()} title={t('app.newFile')} className="nex-electron-hidden nex-brand-button w-8 h-8 flex items-center justify-center rounded-md transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!xml ? (
          <WelcomeScreen
            onCreateBlankScore={handleStartBlankScore}
            onChooseTemplate={handleOpenTemplateDialog}
            onOpenFile={handleOpenFilePicker}
            onFileSelected={handleSelectedFile}
            onFilesSelected={handleSelectedFiles}
            onOpenLibraryScore={handleLibraryOpen}
            importStatus={importStatus}
            aiModelSettings={aiModelSettings}
            aiSettingsHydrated={aiModelSettingsHydrated}
            aiProvider={provider}
            ollamaModel={ollamaModel}
            ollamaConnectionState={ollamaConnectionState}
            onOpenAiSettings={() => setAiSettingsOpenSignal((signal) => signal + 1)}
          />
        ) : (
          <div className="nex-editor-workspace flex-1 flex overflow-hidden">
            {/* Left panel: Score or Benchmark */}
            {showBenchmark ? (
              <BenchmarkPanel
                results={benchmarkResults}
                loading={benchmarkLoading}
                prompt={benchmarkPrompt}
                onApply={(newXml) => { handleXmlUpdate(newXml, { label: 'Benchmark apply' }); setBenchmarkResults([]); setProvider('ollama'); }}
                onClose={handleCloseBenchmark}
                onRunSuite={() => handleRunSuite()}
                onRunOllamaProviderSuite={handleRunOllamaProviderSuite}
                suiteRunning={suiteRunning}
                suiteProgress={suiteProgress}
                suiteResults={suiteResults}
                suiteTotalTests={BENCHMARK_SUITE.length}
                allTestCases={BENCHMARK_SUITE}
                onRunOllamaSuite={handleRunAllOllamaSuite}
                onRunSmartOllamaSuite={handleRunSmartOllamaSuite}
                ollamaSuiteRunning={ollamaSuiteRunning}
                ollamaSuiteProgress={ollamaSuiteProgress}
                ollamaSuiteRows={ollamaSuiteRows}
                ollamaSuiteMode={ollamaSuiteMode}
                ollamaSuiteTotalTests={OLLAMA_MODEL_SUITE.length}
                ollamaModelSuiteTestCases={OLLAMA_MODEL_SUITE}
                ollamaModels={ollamaModels}
                smartOllamaModelCount={smartOllamaModels.length}
              />
            ) : (
              <div className="nex-score-column flex-1 bg-nex-score-bg border-r border-nex-border flex flex-col overflow-hidden">
                {!printView && pencilInputDevice && (
                  <div className="nex-pencil-focus-bar flex items-center gap-3 border-b border-nex-border bg-white px-3 py-1">
                    <button type="button" data-testid="pencil-focus-toggle" aria-pressed={pencilFocusActive}
                      className={`min-h-12 rounded-lg px-4 text-sm font-semibold ${pencilFocusActive ? 'nex-brand-active' : 'nex-brand-button'}`}
                      onClick={() => {
                        setPencilFocus(true);
                        if (!noteInputMode) toggleNoteInput();
                      }}>Pencil · Notes</button>
                    <button type="button" data-testid="finger-mode-toggle" aria-pressed={!noteInputMode}
                      className={`min-h-12 rounded-lg px-4 text-sm font-semibold ${!noteInputMode ? 'nex-brand-active' : 'nex-brand-button'}`}
                      onClick={() => {
                        setPencilFocus(false);
                        if (noteInputMode) toggleNoteInput();
                        setLeftNotationSidebarCollapsed(false);
                      }}>Finger · Markings</button>
                    {pencilFocusActive && <span className="text-xs text-slate-500">Pencil writes · fingers navigate</span>}
                  </div>
                )}
                {!printView && (
                  <NotationToolbar
                    playbackState={playbackState}
                    currentMeasure={currentMeasure}
                    totalBeats={totalBeats}
                    currentBeat={currentBeat}
                    coreDocument={deferredCoreDocument}
                    midiLoading={midiLoading}
                    hasMidi={hasMidi}
                    playbackError={playbackError}
                    tempoOverride={tempoOverride}
                    metronomeEnabled={metronomeEnabled}
                    onPlay={handlePlay}
                    onPause={pause}
                    onStop={stop}
                    onTempoChange={setTempo}
                    onSeek={seek}
                    onToggleMetronome={() => setMetronomeEnabled(v => !v)}
                    onMixerChange={setMixer}
                    noteInputMode={noteInputMode}
                    chordInputMode={chordInputMode}
                    stepInputKeyboardMode={stepInputKeyboardMode}
                    inputByDurationMode={inputByDurationMode}
                    preparedDurationPitchLabel={preparedDurationPitchLabel}
                    midiInputEnabled={midiInputEnabled}
                    midiInputStatus={midiInputStatus}
                    midiInputDevices={midiInputDevices}
                    inputAuditionEnabled={inputAuditionEnabled}
                    microphoneInputEnabled={microphoneInputEnabled}
                    microphoneInputStatus={microphoneInputStatus}
                    microphoneDetectedPitchLabel={microphoneDetectedPitchLabel}
                    microphoneDetectedSoundingPitchLabel={microphoneDetectedSoundingPitchLabel}
                    microphoneSignalLevelDb={microphoneSignalLevelDb}
                    microphoneSignalQuality={microphoneSignalQuality}
                    microphoneInputDevices={microphoneInputDevices}
                    microphoneSelectedDeviceId={microphoneSelectedDeviceId}
                    microphoneDetectionMode={microphoneDetectionMode}
                    microphoneInstrumentMode={microphoneInstrumentMode}
                    leadsheetMode={leadsheetMode}
                    guitarInputMode={guitarInputMode}
                    selectedGuitarString={selectedGuitarString}
                    selectedGuitarFret={selectedGuitarFret}
                    selectedGuitarTuning={selectedGuitarTuning}
                    guitarFretBuffer={guitarFretBuffer}
                    selectedDuration={selectedDuration}
                    selectedAccidental={selectedAccidental}
                    isDotted={isDotted}
                    selectedVoice={selectedVoice}
                    entryMode={entryMode}
                    selectedBarlineMeasureNumber={selectedBarlineMeasureNumber}
                    selectedNote={selectedNote}
                    onChangeActivePitch={(step, addToChord) => inputByDurationMode ? prepareInputByDurationPitch(step, Boolean(addToChord)) : changePitch(step, selectedAccidental)}
                    onChangeActiveOctave={inputByDurationMode ? changeInputByDurationOctave : changeOctave}
                    onToggleNoteInput={toggleNoteInput}
                    onToggleEntryMode={toggleEntryMode}
                    onToggleChordInputMode={toggleChordInputMode}
                    onToggleStepInputKeyboardMode={toggleStepInputKeyboardMode}
                    onToggleInputByDurationMode={toggleInputByDurationMode}
                    onToggleMidiInput={handleToggleMidiInput}
                    onToggleInputAudition={() => setInputAuditionEnabled((enabled) => !enabled)}
                    onToggleMicrophoneInput={handleToggleMicrophoneInput}
                    onSelectMicrophoneInput={(deviceId) => { void selectMicrophoneInput(deviceId); }}
                    onSelectMicrophoneDetectionMode={selectMicrophoneDetectionMode}
                    onSelectMicrophoneInstrumentMode={selectMicrophoneInstrumentMode}
                    onToggleLeadsheetMode={toggleLeadsheetMode}
                    onToggleGuitarInputMode={toggleGuitarInputMode}
                    onInsertGuitarFret={insertGuitarFret}
                    onGuitarTuningChange={setGuitarTuning}
                    onToggleGuitarTechnique={toggleGuitarTechnique}
                    onDurationChange={setDuration}
                    onAccidentalChange={setAccidental}
                    onToggleDotted={toggleDotted}
                    onVoiceChange={v => setVoice(v as 1 | 2 | 3 | 4)}
                    onInsertRest={inputByDurationMode ? prepareInputByDurationRest : insertRest}
                    onInsertSlash={insertSlash}
                    onFillSlashMeasure={fillSlashMeasure}
                    onInsertStepInputPitch={(step, octave, alter) => (
                      noteInputMode
                        ? insertNote(step, octave, { alter })
                        : replaceSelectedPitchAndAdvance(step, octave, alter)
                    )}
                    onSetChordSymbol={setHarmonyAtSelection}
                    onDeleteNote={handleDeleteSelection}
                    onCopySelection={copySelection}
                    onCutSelection={cutSelection}
                    onPasteClipboard={pasteClipboard}
                    clipboardCount={clipboardCount}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onToggleArticulation={toggleArticulation}
                    onAddDynamic={addDynamic}
                    onSetBarline={setBarlineAtSelection}
                    onToggleSlur={toggleSlur}
                    onAddGraceNote={addGraceNoteAtSelection}
                    onAddTuplet={addTupletToSelection}
                    onAddInterval={addIntervalAbove}
                    onLayoutCleanup={handleLayoutCleanup}
                    layoutCleanupLoading={layoutCleanupLoading}
                    showNoteInputTools={false}
                  />
                )}

                {!printView && coreDocument && <AdvancedNoteInput xml={xml} document={coreDocument} selected={selectedNote} selection={selectedNotes}
                  apply={(commands, prepared) => applyCommands(commands, { prepared, selectionAnchor: currentSelectionAnchor }).applied}
                  recording={midiRecording}
                  midi={{ enabled: midiInputEnabled, status: midiInputStatus, toggle: toggleMidiInput, devices: midiDevices, selectedDeviceId: midiSelectedDeviceId, selectDevice: selectMidiDevice }} />}

                {printView ? (
                  <div className="nex-score-stage nex-print-preview-shell flex-1 overflow-auto bg-nex-score-bg p-6">
                    <div className="mx-auto w-full max-w-[980px] rounded-[2rem] border border-nex-border bg-white shadow-[0_24px_80px_-36px_rgba(11,15,20,0.35)]">
                      <div className="border-b border-nex-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {t('app.printViewTitle')}
                      </div>
                      <div className="overflow-auto px-6 py-8">
                        <ScorePreview xml={deferredXml} className="nex-print-preview" onRendered={setPrintReadyXml} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="nex-score-stage flex-1 flex overflow-hidden">
                    <LeftNotationSidebar
                      collapsed={pencilFocusActive ? false : leftNotationSidebarCollapsed}
                      onToggleCollapsed={() => setLeftNotationSidebarCollapsed((current) => !current)}
                      labels={{
                        show: t('app.leftToolsShow'),
                        hide: t('app.leftToolsHide'),
                        title: t('app.leftToolsTitle'),
                      }}
                      collapsedActions={(selectedNote?.guitar || selectionOnTabStaff) ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!guitarInputMode) toggleGuitarInputMode();
                            setLeftNotationSidebarCollapsed(false);
                          }}
                          title="Guitar tab input (TAB button)"
                          aria-label="Guitar tab input (TAB button)"
                          className={`flex h-7 w-7 items-center justify-center rounded-md text-[9px] font-semibold tracking-normal transition-colors ${
                            guitarInputMode
                              ? 'nex-brand-active'
                              : 'nex-brand-button text-slate-600 hover:text-nex-ink'
                          }`}
                        >
                          TAB
                        </button>
                      ) : null}
                    >
                      {!pencilFocusActive && <EditPalette
                        selectedNote={selectedNote}
                        selectedNotes={selectedNotes}
                        noteInputMode={noteInputMode}
                        selectedBarlineMeasureNumber={selectedBarlineMeasureNumber}
                        onToggleArticulation={toggleArticulation}
                        onSetAccidentalDisplay={setAccidentalDisplay}
                        onClearArticulations={clearArticulations}
                        onAddDynamic={addDynamic}
                        onToggleTie={toggleTie}
                        onToggleSlur={toggleSlur}
                        onTransposeSemitones={transposeSemitones}
                        onSetBarline={setBarlineAtSelection}
                        onCopySelection={copySelection}
                        onCutSelection={cutSelection}
                        onPasteClipboard={pasteClipboard}
                        clipboardCount={clipboardCount}
                        onDuplicateSelection={duplicateSelection}
                        onDeleteSelection={handleDeleteSelection}
                        onClearSelection={clearSelection}
                        iconMode
                      />}
                      <NoteInputToolbar
                        placement="sidebar"
                        pencilFocus={pencilFocusActive}
                        coreDocument={deferredCoreDocument}
                        noteInputMode={noteInputMode}
                        chordInputMode={chordInputMode}
                        stepInputKeyboardMode={stepInputKeyboardMode}
                        inputByDurationMode={inputByDurationMode}
                        preparedDurationPitchLabel={preparedDurationPitchLabel}
                        midiInputEnabled={midiInputEnabled}
                        midiInputStatus={midiInputStatus}
                        midiInputDevices={midiInputDevices}
                        inputAuditionEnabled={inputAuditionEnabled}
                        leadsheetMode={leadsheetMode}
                        guitarInputMode={guitarInputMode}
                        selectedGuitarString={selectedGuitarString}
                        selectedGuitarFret={selectedGuitarFret}
                        selectedGuitarTuning={selectedGuitarTuning}
                        guitarFretBuffer={guitarFretBuffer}
                        selectedDuration={selectedDuration}
                        selectedAccidental={selectedAccidental}
                        isDotted={isDotted}
                        selectedVoice={selectedVoice}
                        entryMode={entryMode}
                        selectedNote={selectedNote}
                        selectedBarlineMeasureNumber={selectedBarlineMeasureNumber}
                        onChangeActivePitch={(step, addToChord) => inputByDurationMode ? prepareInputByDurationPitch(step, Boolean(addToChord)) : changePitch(step, selectedAccidental)}
                        onChangeActiveOctave={inputByDurationMode ? changeInputByDurationOctave : changeOctave}
                        onToggleEntryMode={toggleEntryMode}
                        onToggleChordInputMode={toggleChordInputMode}
                        onToggleStepInputKeyboardMode={toggleStepInputKeyboardMode}
                        onToggleInputByDurationMode={toggleInputByDurationMode}
                        onToggleMidiInput={handleToggleMidiInput}
                        onToggleInputAudition={() => setInputAuditionEnabled((enabled) => !enabled)}
                        onToggleLeadsheetMode={toggleLeadsheetMode}
                        onToggleGuitarInputMode={toggleGuitarInputMode}
                        onInsertGuitarFret={insertGuitarFret}
                        onGuitarTuningChange={setGuitarTuning}
                        onToggleGuitarTechnique={toggleGuitarTechnique}
                        onDurationChange={(duration) => {
                          if (!noteInputMode && !selectedNote) toggleNoteInput();
                          setDuration(duration);
                        }}
                        onAccidentalChange={setAccidental}
                        onToggleDotted={toggleDotted}
                        onVoiceChange={v => setVoice(v as 1 | 2 | 3 | 4)}
                        onInsertRest={inputByDurationMode ? prepareInputByDurationRest : insertRest}
                        onInsertSlash={insertSlash}
                        onFillSlashMeasure={fillSlashMeasure}
                        onInsertStepInputPitch={(step, octave, alter) => (
                          noteInputMode
                            ? insertNote(step, octave, { alter })
                            : replaceSelectedPitchAndAdvance(step, octave, alter)
                        )}
                        onSetChordSymbol={setHarmonyAtSelection}
                        onDeleteNote={handleDeleteSelection}
                        onCopySelection={copySelection}
                        onCutSelection={cutSelection}
                        onPasteClipboard={pasteClipboard}
                        clipboardCount={clipboardCount}
                        onToggleArticulation={toggleArticulation}
                        onAddDynamic={addDynamic}
                        onSetBarline={setBarlineAtSelection}
                        onToggleSlur={toggleSlur}
                        onAddGraceNote={addGraceNoteAtSelection}
                        onAddTuplet={addTupletToSelection}
                        onAddInterval={addIntervalAbove}
                      />
                    </LeftNotationSidebar>
                    <div className="flex-1 overflow-auto p-6 bg-nex-score-bg">
                      {renderScoreEditor()}
                    </div>
                    <IpadSelectionActions
                      selectedNote={selectedNote}
                      onDeleteNote={handleDeleteSelection}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Right panel: Workspace */}
            {(sidebarCollapsed || pencilFocusActive) ? (
              <div className="flex flex-col items-center justify-start pt-2 w-8 bg-white border-l border-nex-border shrink-0" data-testid="workspace-collapsed-rail">
                <button
                  onClick={() => { setPencilFocus(false); setSidebarCollapsed(false); }}
                  title={t('app.panelShow')}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-nex-ink hover:bg-nex-surface transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            ) : (
            <div className="nex-workspace-panel w-[30%] min-w-[300px] flex flex-col bg-white overflow-hidden border-l border-nex-border" data-testid="workspace-panel">
              <div className="border-b border-nex-border px-4 bg-nex-toolbar-bg">
                <div className="flex items-center gap-0">
                  {([
                    ['assistant', t('workspace.ai')],
                    ['library', t('workspace.library')],
                    ['inspector', t('workspace.inspector')],
                  ] as const).map(([tabId, label]) => (
                    <button
                      key={tabId}
                      onClick={() => setWorkspaceTab(tabId)}
                      className={`px-4 py-2.5 text-xs font-semibold tracking-wide transition-colors border-b-2 -mb-px ${
                        workspaceTab === tabId
                          ? 'border-nex-accent bg-nex-accent-muted text-nex-accent'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    title={t('app.panelHide')}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-nex-ink hover:bg-nex-surface transition-colors mr-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 p-3 overflow-hidden">
                {workspaceTab === 'assistant' && (
                  <div className="flex h-full flex-col overflow-hidden min-h-0">
                  <ChatPanel
                    xml={xml}
                    provider={provider === 'benchmark' ? 'ollama' : provider}
                    ollamaModel={ollamaModel}
                    aiSettings={aiProviderRequestSettings}
                    scoreKey={chatScoreKey}
                    scoreRevision={scoreRevision}
                    scoreSessionReady={scoreSessionReady}
                    selection={selection}
                      onXmlUpdate={handleXmlUpdate}
                      onApplyCommands={handleApplyCommands}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onBenchmark={handleBenchmark}
                      isBenchmark={provider === 'benchmark'}
                      onOperationsApplied={setLastOperations}
                      onTranscriptChange={setChatTranscript}
                    />
                    <EditLibrary
                      xml={xml}
                      lastOperations={lastOperations.length ? lastOperations : lastCommands}
                      onXmlUpdate={handleXmlUpdate}
                    />
                  </div>
                )}

                {workspaceTab === 'library' && (
                  <div className="h-full overflow-auto">
                    <ScoreLibrary
                      currentScoreId={currentScoreId}
                      dense
                      onOpenScore={handleLibraryOpen}
                    />
                  </div>
                )}

                {workspaceTab === 'inspector' && (
                  <ScoreInspector
                    xml={xml}
                    coreDocument={coreDocument}
                    selection={selection}
                    selectedNote={selectedNote}
                    selectedNotes={selectedNotes}
                    currentMeasure={currentMeasure}
                    onApplyCommands={handleApplyCommands}
                    onOpenExtractedPart={handleOpenExtractedPart}
                  />
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
