import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NativePlatformBootstrap } from "@/components/NativePlatformBootstrap";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "nex-note",
  description: "Downloadable music app for private scores, tabs, AI editing, and embeds.",
  icons: {
    // Built from the app icon by scripts/build-web-icons.mjs; Next adds
    // app/favicon.ico on its own.
    icon: [{ url: "/brand/nex-note-app-icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gitBranch = process.env.NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH ?? '';
  const gitBranchClassName = gitBranch === 'devel' ? 'nex-git-branch-devel' : 'nex-git-branch-nondevel';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${gitBranchClassName}`}
      data-git-branch={gitBranch}
    >
      <body className="min-h-full flex flex-col">
        <NativePlatformBootstrap />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
