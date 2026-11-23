// Single source of truth for the public website's download links. The URLs
// use GitHub's stable "latest" redirects, so they only change if the asset
// names change. The version shown on the website comes from the Release
// itself (`release-availability.ts`), not from package.json, which carries a
// `-dev` version on devel and after a website-only deploy.

export const GITHUB_REPO_URL = 'https://github.com/hybridpicker/nex-note';

export const RELEASE_DMG_ASSET = 'Nex-Note-mac-universal.dmg';
export const LINUX_APPIMAGE_ASSET = 'Nex-Note-linux-x86_64.AppImage';

export const RELEASE_DMG_URL = `${GITHUB_REPO_URL}/releases/latest/download/${RELEASE_DMG_ASSET}`;
export const LINUX_APPIMAGE_URL = `${GITHUB_REPO_URL}/releases/latest/download/${LINUX_APPIMAGE_ASSET}`;
export const ALL_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;

export const OMARCHY_PACKAGE = 'nex-note-bin';
// Set to true once nex-note-bin is on the AUR (packaging/aur/README.md). Until then Omarchy and Arch
// users build the package from the PKGBUILD attached to every Release.
export const AUR_PUBLISHED = false;
export const OMARCHY_PKGBUILD_URL = `${GITHUB_REPO_URL}/releases/latest/download/PKGBUILD`;
export const OMARCHY_INSTALL_COMMAND = AUR_PUBLISHED
  ? `yay -S ${OMARCHY_PACKAGE}`
  : `curl -LO ${OMARCHY_PKGBUILD_URL} && makepkg -si`;

export const CHANGELOG_URL = `${GITHUB_REPO_URL}/blob/main/CHANGELOG.md`;
export const LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;
export const NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new/choose`;

export const MACOS_MINIMUM = 'macOS 13 Ventura';

export type ReleaseLinks = {
  macDmgUrl: string;
  linuxAppImageUrl: string;
  allReleasesUrl: string;
  omarchyInstallCommand: string;
};

export const RELEASE_LINKS: ReleaseLinks = {
  macDmgUrl: RELEASE_DMG_URL,
  linuxAppImageUrl: LINUX_APPIMAGE_URL,
  allReleasesUrl: ALL_RELEASES_URL,
  omarchyInstallCommand: OMARCHY_INSTALL_COMMAND,
};
