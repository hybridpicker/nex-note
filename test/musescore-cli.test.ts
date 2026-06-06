import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, chmodSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';

import {
  cleanMuseScoreStderr,
  formatMuseScoreConversionError,
  museScoreSpawnEnv,
  resolveMuseScoreCli,
} from '@/lib/musescore-cli';

test('resolveMuseScoreCli falls back from an invalid configured path to PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-mscore-'));
  const executable = join(dir, 'mscore');
  writeFileSync(executable, '#!/bin/sh\nexit 0\n');
  chmodSync(executable, 0o755);

  const env: NodeJS.ProcessEnv = {
    MUSESCORE_CLI: '/definitely/missing/mscore',
    NODE_ENV: 'test',
    PATH: dir,
  };

  const resolved = resolveMuseScoreCli(env);

  assert.equal(resolved, executable);
});

test('museScoreSpawnEnv keeps server-local binary directories ahead of inherited PATH', () => {
  const inputEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: `/custom/bin${delimiter}/other/bin`, USER: 'nex' };
  const env = museScoreSpawnEnv(inputEnv);

  assert.match(env.PATH, /^\/home\/jarvis\/bin/);
  assert.match(env.PATH, /\/custom\/bin/);
  assert.match(env.QT_LOGGING_RULES, /qt\.qml\.typeregistration=false/);
  assert.equal(env.APPIMAGE_EXTRACT_AND_RUN, '1');
  assert.equal(env.QT_QPA_PLATFORM, process.platform === 'darwin' ? 'cocoa' : 'offscreen');
  assert.equal(env.XDG_RUNTIME_DIR, '/tmp/musescore-runtime-nex');
});

test('cleanMuseScoreStderr removes repeated Qt QML warnings even when MuseScore writes them on one line', () => {
  const stderr = [
    '/lib64/libnss3.so findlib: libOpenGL.so.0: cannot open shared object file: No such file or directory',
    'qt.qml.typeregistration: Invalid QML element name "IconCode"; value type names should begin with a lowercase letter qt.qml.typeregistration: Invalid QML element name "MusicalSymbolCodes"; value type names should begin with a lowercase letter',
  ].join('\n');

  assert.equal(
    cleanMuseScoreStderr(stderr),
    '/lib64/libnss3.so findlib: libOpenGL.so.0: cannot open shared object file: No such file or directory',
  );
});

test('formatMuseScoreConversionError gives a concise dependency hint for missing libOpenGL', () => {
  const message = formatMuseScoreConversionError({
    code: 40,
    stderr: [
      '/lib64/libnss3.so findlib: libOpenGL.so.0: cannot open shared object file: No such file or directory',
      'qt.qml.typeregistration: Invalid QML element name "IconCode"; value type names should begin with a lowercase letter',
    ].join('\n'),
  });

  assert.equal(
    message,
    'MuseScore conversion failed: exited with code 40: /lib64/libnss3.so findlib: libOpenGL.so.0: cannot open shared object file: No such file or directory Install libOpenGL.so.0 (for example the libopengl0 package) or point MUSESCORE_CLI at a working MuseScore install.',
  );
});
