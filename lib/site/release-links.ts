// Single source of truth for the public website's download links and version.
// The release script bumps `version` in package.json; the URLs use GitHub's
// stable "latest" redirects, so they only change if the asset names change.
import packageJson from '../../package.json';

export const RELEASE_VERSION: string = packageJson.version;

export const GITHUB_REPO_URL = 'https://github.com/hybridpicker/nex-note';

export const RELEASE_DMG_ASSET = 'Nex-Note-mac-universal.dmg';
export const LINUX_APPIMAGE_ASSET = 'Nex-Note-linux-x86_64.AppImage';

export const RELEASE_DMG_URL = `${GITHUB_REPO_URL}/releases/latest/download/${RELEASE_DMG_ASSET}`;
export const LINUX_APPIMAGE_URL = `${GITHUB_REPO_URL}/releases/latest/download/${LINUX_APPIMAGE_ASSET}`;
export const ALL_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;

export const OMARCHY_PACKAGE = 'nex-note-bin';
export const OMARCHY_INSTALL_COMMAND = `yay -S ${OMARCHY_PACKAGE}`;

export const CHANGELOG_URL = `${GITHUB_REPO_URL}/blob/main/CHANGELOG.md`;
export const LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;
export const NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new/choose`;

export const MACOS_MINIMUM = 'macOS 12 Monterey';

export type ReleaseLinks = {
  version: string;
  macDmgUrl: string;
  linuxAppImageUrl: string;
  allReleasesUrl: string;
  omarchyInstallCommand: string;
};

export const RELEASE_LINKS: ReleaseLinks = {
  version: RELEASE_VERSION,
  macDmgUrl: RELEASE_DMG_URL,
  linuxAppImageUrl: LINUX_APPIMAGE_URL,
  allReleasesUrl: ALL_RELEASES_URL,
  omarchyInstallCommand: OMARCHY_INSTALL_COMMAND,
};
