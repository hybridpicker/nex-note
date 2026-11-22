// Update Check for Releases (GLOSSARY.md): only in the Release channel, only after the user agreed,
// and every download and install is confirmed by the user. The Developer App never runs this; it
// rebuilds itself from `devel` instead (see main.cjs).
//
// Sources: GitHub Releases of hybridpicker/nex-note (latest-mac.yml / latest-linux.yml written by
// electron-builder). Nothing but the standard HTTP request (IP address, user agent) reaches GitHub;
// there is no telemetry.

const fs = require('node:fs/promises');
const path = require('node:path');

const PREFERENCES_FILE = 'update-preferences.json';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15 * 1000;

const STRINGS = {
  en: {
    consentTitle: 'Check for updates automatically?',
    consentDetail:
      'Nex Note can look for new versions on GitHub when it starts. Only the usual request data (IP address, app version) reaches GitHub. No usage data is sent. You can change this later in the Nex Note menu.',
    consentYes: 'Check automatically',
    consentNo: 'Not now',
    availableTitle: (version) => `Nex Note ${version} is available`,
    availableDetail: (current) => `You have ${current}. Download and install the update now?`,
    download: 'Download',
    later: 'Later',
    readyTitle: (version) => `Nex Note ${version} is ready to install`,
    readyDetail: 'Restart Nex Note to finish the update. Unsaved work prompts as usual.',
    restart: 'Restart now',
    upToDateTitle: 'Nex Note is up to date',
    upToDateDetail: (current) => `Version ${current} is the newest Release.`,
    errorTitle: 'Update check failed',
    errorDetail: 'Nex Note could not reach the update server. Try again later.',
    packageManagedTitle: 'Updates come from your package manager',
    packageManagedDetail: 'This copy of Nex Note was installed by a package manager. Update it with yay or pacman.',
    ok: 'OK',
  },
  de: {
    consentTitle: 'Automatisch nach Updates suchen?',
    consentDetail:
      'Nex Note kann beim Start auf GitHub nach neuen Versionen suchen. Dabei erreichen GitHub nur die üblichen Anfragedaten (IP-Adresse, App-Version). Es werden keine Nutzungsdaten gesendet. Du kannst das später im Nex-Note-Menü ändern.',
    consentYes: 'Automatisch suchen',
    consentNo: 'Jetzt nicht',
    availableTitle: (version) => `Nex Note ${version} ist verfügbar`,
    availableDetail: (current) => `Du hast ${current}. Update jetzt laden und installieren?`,
    download: 'Laden',
    later: 'Später',
    readyTitle: (version) => `Nex Note ${version} ist bereit zur Installation`,
    readyDetail: 'Starte Nex Note neu, um das Update abzuschließen. Ungesicherte Arbeit wird wie gewohnt abgefragt.',
    restart: 'Jetzt neu starten',
    upToDateTitle: 'Nex Note ist aktuell',
    upToDateDetail: (current) => `Version ${current} ist das neueste Release.`,
    errorTitle: 'Update-Prüfung fehlgeschlagen',
    errorDetail: 'Nex Note konnte den Update-Server nicht erreichen. Versuche es später noch einmal.',
    packageManagedTitle: 'Updates kommen über deinen Paketmanager',
    packageManagedDetail: 'Diese Nex-Note-Installation stammt aus einem Paketmanager. Aktualisiere sie mit yay oder pacman.',
    ok: 'OK',
  },
};

function stringsForLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('de') ? STRINGS.de : STRINGS.en;
}

// Where in-app updates are possible at all. macOS Releases update through Squirrel (signed app);
// on Linux only the AppImage can replace itself. The Omarchy Package (AUR) is updated by pacman.
function resolveUpdateSupport({ platform, env }) {
  if (platform === 'darwin') return 'in-app';
  if (platform === 'linux') return env.APPIMAGE ? 'in-app' : 'package-manager';
  return 'unsupported';
}

function normalizePreferences(raw) {
  const automatic = raw && typeof raw.automaticChecks === 'boolean' ? raw.automaticChecks : null;
  return { automaticChecks: automatic };
}

async function readPreferences(userDataPath, fileSystem = fs) {
  try {
    return normalizePreferences(JSON.parse(await fileSystem.readFile(path.join(userDataPath, PREFERENCES_FILE), 'utf8')));
  } catch {
    return normalizePreferences(null);
  }
}

async function writePreferences(userDataPath, preferences, fileSystem = fs) {
  await fileSystem.mkdir(userDataPath, { recursive: true });
  await fileSystem.writeFile(
    path.join(userDataPath, PREFERENCES_FILE),
    `${JSON.stringify(normalizePreferences(preferences), null, 2)}\n`,
  );
}

function createReleaseUpdateController({ app, dialog, getWindow, loadUpdater, platform = process.platform, env = process.env }) {
  const strings = () => stringsForLocale(app.getLocale());
  const support = resolveUpdateSupport({ platform, env });
  let updater = null;
  let preferences = normalizePreferences(null);
  let interval = null;
  let manualCheck = false;
  let busy = false;
  let onPreferencesChanged = () => {};

  function showMessage(options) {
    const window = getWindow();
    return window && !window.isDestroyed()
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options);
  }

  function ensureUpdater() {
    if (updater) return updater;
    const { autoUpdater } = loadUpdater();
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;

    autoUpdater.on('update-available', async (info) => {
      const text = strings();
      const { response } = await showMessage({
        type: 'info',
        message: text.availableTitle(info.version),
        detail: text.availableDetail(app.getVersion()),
        buttons: [text.download, text.later],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        autoUpdater.downloadUpdate().catch(() => reportError());
      } else {
        busy = false;
      }
    });
    autoUpdater.on('update-not-available', async () => {
      busy = false;
      if (!manualCheck) return;
      const text = strings();
      await showMessage({ type: 'info', message: text.upToDateTitle, detail: text.upToDateDetail(app.getVersion()), buttons: [text.ok] });
    });
    autoUpdater.on('update-downloaded', async (info) => {
      busy = false;
      const text = strings();
      const { response } = await showMessage({
        type: 'info',
        message: text.readyTitle(info.version),
        detail: text.readyDetail,
        buttons: [text.restart, text.later],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) autoUpdater.quitAndInstall();
      else autoUpdater.autoInstallOnAppQuit = true;
    });
    autoUpdater.on('error', () => reportError());
    updater = autoUpdater;
    return updater;
  }

  async function reportError() {
    busy = false;
    if (!manualCheck) return;
    const text = strings();
    await showMessage({ type: 'warning', message: text.errorTitle, detail: text.errorDetail, buttons: [text.ok] });
  }

  async function check({ manual }) {
    if (support === 'package-manager') {
      if (manual) {
        const text = strings();
        await showMessage({ type: 'info', message: text.packageManagedTitle, detail: text.packageManagedDetail, buttons: [text.ok] });
      }
      return;
    }
    if (support !== 'in-app' || busy) return;
    busy = true;
    manualCheck = manual;
    try {
      await ensureUpdater().checkForUpdates();
    } catch {
      await reportError();
    }
  }

  function schedule() {
    if (interval) clearInterval(interval);
    interval = null;
    if (preferences.automaticChecks !== true || support !== 'in-app') return;
    setTimeout(() => void check({ manual: false }), FIRST_CHECK_DELAY_MS).unref?.();
    interval = setInterval(() => void check({ manual: false }), CHECK_INTERVAL_MS);
    interval.unref?.();
  }

  async function askForConsent() {
    const text = strings();
    const { response } = await showMessage({
      type: 'question',
      message: text.consentTitle,
      detail: text.consentDetail,
      buttons: [text.consentYes, text.consentNo],
      defaultId: 0,
      cancelId: 1,
    });
    await setAutomaticChecks(response === 0);
  }

  async function setAutomaticChecks(enabled) {
    preferences = { automaticChecks: Boolean(enabled) };
    await writePreferences(app.getPath('userData'), preferences);
    schedule();
    onPreferencesChanged(preferences);
  }

  return {
    support,
    get automaticChecks() {
      return preferences.automaticChecks === true;
    },
    onPreferencesChanged(listener) {
      onPreferencesChanged = listener;
    },
    async start() {
      if (support !== 'in-app') return;
      preferences = await readPreferences(app.getPath('userData'));
      if (preferences.automaticChecks === null) await askForConsent();
      else schedule();
    },
    checkNow: () => check({ manual: true }),
    setAutomaticChecks,
    menuLabels() {
      const text = stringsForLocale(app.getLocale());
      return text === STRINGS.de
        ? { check: 'Nach Updates suchen…', automatic: 'Automatisch nach Updates suchen' }
        : { check: 'Check for Updates…', automatic: 'Check for Updates Automatically' };
    },
  };
}

module.exports = {
  CHECK_INTERVAL_MS,
  PREFERENCES_FILE,
  createReleaseUpdateController,
  normalizePreferences,
  readPreferences,
  resolveUpdateSupport,
  stringsForLocale,
  writePreferences,
};
