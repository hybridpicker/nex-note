import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearLibraryScores,
  deleteLibraryScore,
  getLibraryScores,
  saveLibraryScore,
  toggleLibraryFavorite,
  touchLibraryScore,
} from '../lib/score-library.ts';
import { buildChatScoreKey, readChatTaskState, writeChatTaskState } from '../lib/chat-task-state.ts';
import { BUILT_IN_PRESETS, deleteUserPreset, getUserPresets, saveUserPreset } from '../lib/edit-presets.ts';
import { addRecentFile, clearRecentFiles, getRecentFiles } from '../lib/recent-files.ts';
import { createNxnFile } from '../lib/nxn-file.ts';
import { hasNxnProjectDirectoryPermission } from '../lib/nxn-project-directory.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

const storage = new MemoryStorage();

test.beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    window: {},
    localStorage: storage,
  });
});

test('recent files stay deduplicated and capped at eight items', () => {
  for (let index = 0; index < 10; index++) {
    addRecentFile(`score-${index}.musicxml`, index);
  }
  addRecentFile('score-4.musicxml', 999, {
    libraryScoreId: 'saved-score-4',
    importedName: 'score-4.mxl',
  });

  const files = getRecentFiles();
  assert.equal(files.length, 8);
  assert.equal(files[0].name, 'score-4.musicxml');
  assert.equal(files[0].size, 999);
  assert.equal(files[0].libraryScoreId, 'saved-score-4');
  assert.equal(files[0].importedName, 'score-4.mxl');

  clearRecentFiles();
  assert.deepEqual(getRecentFiles(), []);
});

test('library save, reopen touch, favorite toggle, delete, and clear behave like the visible library workflow', async () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const first = saveLibraryScore({ name: 'first.musicxml', xml: SAMPLE_XML });
    now = 2000;
    const second = saveLibraryScore({ name: 'second.musicxml', xml: SAMPLE_XML.replace('C', 'D') });

    let items = getLibraryScores();
    assert.equal(items.length, 2);
    assert.equal(items[0].id, second.id);
    assert.equal(items[0].measures, 1);
    assert.equal(items[0].parts, 1);
    assert.equal(items[0].format, 'musicxml');

    now = 3000;
    touchLibraryScore(first.id);
    items = getLibraryScores();
    assert.equal(items[0].id, first.id);

    toggleLibraryFavorite(first.id);
    items = getLibraryScores();
    assert.equal(items.find((item) => item.id === first.id)?.favorite, true);

    deleteLibraryScore(second.id);
    items = getLibraryScores();
    assert.deepEqual(items.map((item) => item.id), [first.id]);

    clearLibraryScores();
    assert.deepEqual(getLibraryScores(), []);
  } finally {
    Date.now = originalNow;
  }
});

test('library stores native .nxn metadata without putting the project payload in localStorage', () => {
  const nativeProject = createNxnFile({
    document: importMusicXmlToCore(SAMPLE_XML),
    sourceMusicXml: SAMPLE_XML,
  });

  const saved = saveLibraryScore({
    name: 'cached-score.musicxml',
    xml: SAMPLE_XML,
    nativeProject,
  });

  const [stored] = getLibraryScores();
  assert.equal(stored.id, saved.id);
  assert.equal(stored.name, 'cached-score.musicxml');
  assert.equal(stored.nativeName, 'cached-score.nxn');
  assert.equal(stored.format, 'musicxml');
  assert.equal('nativeProject' in stored, false);
  assert.equal(stored.xml, '');
});

test('project directory permission probe does not request a prompt', async () => {
  let requested = false;
  const handle = {
    async queryPermission(descriptor?: { mode?: string }) {
      assert.equal(descriptor?.mode, 'readwrite');
      return 'prompt';
    },
    async requestPermission() {
      requested = true;
      return 'granted';
    },
  } as unknown as FileSystemDirectoryHandle;

  assert.equal(await hasNxnProjectDirectoryPermission(handle), false);
  assert.equal(requested, false);
});

test('library read migration strips legacy native project payloads and xml bodies', () => {
  const nativeProject = createNxnFile({
    document: importMusicXmlToCore(SAMPLE_XML),
    sourceMusicXml: SAMPLE_XML,
  });
  storage.setItem('nex-note:score-library', JSON.stringify([{
    id: 'legacy-native',
    name: 'legacy.musicxml',
    nativeProject,
    xml: SAMPLE_XML.repeat(20),
    format: 'musicxml',
    sizeBytes: 123,
    measures: 1,
    parts: 1,
    favorite: false,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
  }]));

  const [stored] = getLibraryScores();
  assert.equal(stored.id, 'legacy-native');
  assert.equal(stored.nativeName, 'legacy.nxn');
  assert.equal('nativeProject' in stored, false);
  assert.equal(stored.xml, '');
});

test('preset storage saves and removes user presets while keeping built-ins available', () => {
  assert.ok(BUILT_IN_PRESETS.some((preset) => preset.name === 'Clean score'));
  assert.ok(BUILT_IN_PRESETS.some((preset) => preset.name === 'Practice version'));
  assert.ok(BUILT_IN_PRESETS.some((preset) => preset.name === 'Key: Bb major'));

  const saved = saveUserPreset('Transpose two up', [{ type: 'transposeRangeChromatic', semitones: 2 }]);
  assert.equal(getUserPresets().length, 1);
  assert.equal(getUserPresets()[0].id, saved.id);

  deleteUserPreset(saved.id);
  assert.deepEqual(getUserPresets(), []);
});

test('chat task state persists per score key for musician workflows', () => {
  const scoreKey = buildChatScoreKey('study.musicxml', SAMPLE_XML, null);
  writeChatTaskState(scoreKey, {
    scoreKey,
    preferredInstrument: 'clarinet-bb',
    practiceProfile: 'roomy',
    lastWorkflow: 'practice-assist',
  });

  assert.deepEqual(readChatTaskState(scoreKey), {
    scoreKey,
    preferredInstrument: 'clarinet-bb',
    practiceProfile: 'roomy',
    lastWorkflow: 'practice-assist',
  });
});
