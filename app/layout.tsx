import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "nex-note",
  description: "Downloadable music app for private scores, tabs, AI editing, and embeds.",
  icons: {
    icon: [
      { url: "/brand/nex-note-icon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/brand/nex-note-icon.png",
  },
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
