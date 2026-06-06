#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const lockPath = path.join(root, '.next', 'dev', 'lock');
const nextBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readActiveServer() {
  try {
    const raw = await readFile(lockPath, 'utf8');
    const data = JSON.parse(raw);
    if (!alive(data.pid)) return null;
    return {
      pid: data.pid,
      url: typeof data.appUrl === 'string'
        ? data.appUrl
        : `http://${data.hostname ?? 'localhost'}:${data.port ?? 3000}`,
    };
  } catch {
    return null;
  }
}

function openBrowser(url) {
  if (hasFlag('--no-open')) return;

  const resolvedUrl = hasFlag('--visual-debug')
    ? `${url}${url.includes('?') ? '&' : '?'}debug=true`
    : url;
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', resolvedUrl] : [resolvedUrl];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

function safeWrite(stream, text) {
  try {
    stream.write(text);
  } catch (error) {
    if (error?.code === 'EPIPE') return;
    throw error;
  }
}

process.stdout.on('error', (error) => {
  if (error?.code === 'EPIPE') return;
  throw error;
});

process.stderr.on('error', (error) => {
  if (error?.code === 'EPIPE') return;
  throw error;
});

async function main() {
  const activeServer = await readActiveServer();
  if (activeServer) {
    console.log(`nex-note dev server is already running at ${activeServer.url} (PID ${activeServer.pid}).`);
    openBrowser(activeServer.url);
    return;
  }

  try {
    await access(nextBin, constants.X_OK);
  } catch {
    console.error('Next.js binary not found. Run `npm install` first.');
    process.exit(1);
  }

  const nextArgs = ['dev'];
  if (hasFlag('--webpack')) nextArgs.push('--webpack');
  if (hasFlag('--turbo')) nextArgs.push('--turbo');
  const child = spawn(nextBin, nextArgs, {
    cwd: root,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let opened = false;
  const maybeOpen = (chunk) => {
    const text = chunk.toString();
    safeWrite(process.stdout, text);
    if (opened || hasFlag('--no-open')) return;
    const match = text.match(/Local:\s+(https?:\/\/[^\s]+)/);
    if (!match) return;
    opened = true;
    openBrowser(match[1]);
  };

  child.stdout.on('data', maybeOpen);
  child.stderr.on('data', (chunk) => {
    safeWrite(process.stderr, chunk);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

void main();
