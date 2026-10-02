import { accessSync, constants } from 'fs';
import { platform } from 'os';
import { delimiter, join } from 'path';
import { spawn } from 'child_process';
import { cleanMuseScoreStderr } from './musescore-stderr';

const COMMON_MUSESCORE_BINARIES = ['mscore', 'musescore', 'musescore4'];
const COMMON_MUSESCORE_PATHS = [
  '/usr/local/bin/mscore',
  '/usr/bin/mscore',
  '/usr/local/bin/musescore',
  '/usr/bin/musescore',
  '/usr/local/bin/musescore4',
  '/usr/bin/musescore4',
  '/snap/bin/musescore',
  '/Applications/MuseScore 4.app/Contents/MacOS/mscore',
];

function isExecutable(path: string | undefined) {
  if (!path) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(env: NodeJS.ProcessEnv) {
  return (env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => COMMON_MUSESCORE_BINARIES.map((binary) => join(directory, binary)));
}

export function resolveMuseScoreCli(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.MUSESCORE_CLI?.trim();
  const candidates = [
    configured,
    ...pathCandidates(env),
    ...COMMON_MUSESCORE_PATHS,
  ];

  const resolved = candidates.find(isExecutable);
  if (!resolved) {
    throw new Error(
      'MuseScore CLI not found. Set MUSESCORE_CLI to an executable mscore/musescore path.'
    );
  }
  return resolved;
}

export function readMuseScoreCliVersion(path: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  return new Promise((resolve) => {
    const proc = spawn(path, ['--version'], {
      timeout: 10000,
      env: museScoreSpawnEnv(env),
    });

    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    proc.on('error', () => resolve(undefined));
    proc.on('close', () => {
      resolve(output.match(/\d+(?:\.\d+){1,3}/)?.[0]);
    });
  });
}

export function museScoreSpawnEnv(env: NodeJS.ProcessEnv = process.env) {
  const user = env.USER || env.LOGNAME || 'jarvis';
  const qtPlatform = platform() === 'darwin'
    ? env.QT_QPA_PLATFORM || 'cocoa'
    : env.QT_QPA_PLATFORM || 'offscreen';
  return {
    ...env,
    PATH: [
      '/home/jarvis/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      env.PATH ?? '',
    ].filter(Boolean).join(delimiter),
    QT_LOGGING_RULES: [
      env.QT_LOGGING_RULES,
      'qt.qml.typeregistration=false',
    ].filter(Boolean).join(';'),
    APPIMAGE_EXTRACT_AND_RUN: env.APPIMAGE_EXTRACT_AND_RUN || '1',
    QT_QPA_PLATFORM: qtPlatform,
    XDG_RUNTIME_DIR: env.XDG_RUNTIME_DIR || `/tmp/musescore-runtime-${user}`,
  };
}

export { cleanMuseScoreStderr };

export function formatMuseScoreConversionError(input: {
  code: number | null;
  signal?: NodeJS.Signals | null;
  stderr: string;
  timeoutMs?: number;
}) {
  const cleanedStderr = cleanMuseScoreStderr(input.stderr);
  const reason = input.code === null
    ? `timed out${input.timeoutMs ? ` after ${Math.round(input.timeoutMs / 1000)}s` : ''}${input.signal ? ` (${input.signal})` : ''}`
    : `exited with code ${input.code}`;
  const hint = /libOpenGL\.so\.0: cannot open shared object file/.test(cleanedStderr)
    ? ' Install libOpenGL.so.0 (for example the libopengl0 package) or point MUSESCORE_CLI at a working MuseScore install.'
    : '';
  if (!cleanedStderr && input.code === 40) {
    return 'MuseScore could not convert this file. The file may be unsupported, damaged, or need manual import review. Try MusicXML/MXL when available, or submit this file as a founder compatibility case.';
  }
  return `MuseScore conversion failed: ${reason}${cleanedStderr ? `: ${cleanedStderr}` : ''}${hint}`;
}
