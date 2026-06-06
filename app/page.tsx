import type { ReactNode } from "react";

const founderMailto =
  "mailto:lukas@schoensgibl.com?subject=nex-note%20founder%20app%20build&body=Hi%20Lukas%2C%0A%0AI%20want%20to%20test%20the%20nex-note%20downloadable%20app.%0A%0AI%20am%20a%3A%20%5Bmusic%20teacher%2Fguitar%20teacher%2Fchoir%20director%2Fschool%2Farranger%2Fmusician%5D%0AMy%20main%20file%20formats%20are%3A%20%5BMusicXML%2FMXL%2FMSCZ%2FPDF%2Fphoto%2FGuitarPro%2FMIDI%5D%0AI%20can%20submit%20files%20that%20are%3A%20%5Bown%2Fself-created%2Flicensed%2Fpublic-domain%5D%0AI%20need%20nex-note%20for%3A%20%5Bprivate%20archive%2FAI%20editing%2Farranging%2Fexport%2Fprivate%20embeds%5D%0A";
const webAlphaHref = "/nex-note-app?locale=en";

const paidWorkflow =
  "Bring your private score/tab archive into nex-note. Use AI-assisted edit/arrange with preview-before-apply. Validate and export MusicXML/MXL/MSCZ/MIDI. Publish private embeds for students, members, or collaborators.";

const audience = [
  "Music teachers with student material, transpositions, and practice exports.",
  "Guitar teachers with tab, GuitarPro, MIDI, and score exchange needs.",
  "Choirs, bands, and small schools that need private member or student access.",
  "Arrangers who want AI-assisted cleanup, voicing, parts, and export checks.",
];

const supportedFormats = [
  { title: "Supported now", items: ["MusicXML", "XML", "MXL", "NXN projects", "MIDI export/playback paths"] },
  { title: "Experimental", items: ["MSCZ via MuseScore CLI", "GuitarPro via importer tooling", "MIDI import reconstruction", "ABC export"] },
  { title: "Review required", items: ["PDF", "photos", "scans", "image-based imports"] },
];

const testerRules = [
  "scores you own",
  "scores you created yourself",
  "scores you are licensed to process",
  "public-domain scores",
];

const appLoop = [
  "Import permitted score, tab, or MIDI files from a private archive.",
  "Ask the AI editor for cleanup, arrangement, transposition, or export prep.",
  "Preview every AI change before applying it to the score.",
  "Validate the result and export MusicXML, MXL, MSCZ, MIDI, or private embeds where the path is available.",
];

const screenshotHighlights = [
  {
    title: "Score editor",
    text: "Rendered score workspace with notation tools, playback controls, and export-focused validation context.",
  },
  {
    title: "AI assistant",
    text: "Contextual edit requests stay visible beside the score, with changes reviewed before the workflow continues.",
  },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4f46ff]">
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f8] text-[#111312]">
      <section className="relative flex min-h-[90vh] overflow-hidden border-b border-[#e2e5e3] bg-[#f7f8f8]">
        <img
          src="/screenshots/ai-edit-preview.png"
          alt="nex-note score cleanup workspace"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.09]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,248,248,0.78)_0%,rgba(247,248,248,0.94)_58%,rgba(247,248,248,1)_100%)]" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between gap-4">
            <img src="/brand/nex-note-logo.png" alt="nex-note" className="h-9 w-auto" />
            <a
              href={founderMailto}
              className="rounded-md border border-[#d9dcff] bg-white/70 px-3 py-2 text-sm font-semibold text-[#111312] shadow-sm backdrop-blur transition hover:border-[#4f46ff] hover:text-[#4f46ff]"
            >
              Request app build
            </a>
          </nav>

          <div className="flex flex-1 flex-col justify-end pb-10 pt-20 sm:pb-14 lg:pb-16">
            <div className="max-w-4xl">
              <Eyebrow>Downloadable local-first music app</Eyebrow>
              <h1 className="mt-5 text-5xl font-semibold leading-none text-[#111312] sm:text-6xl lg:text-7xl">
                nex-note
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4b5551]">
                A downloadable app for private scores, tabs, AI-assisted editing, arrangement help, validation, export, and private embeds. This website is only the testing landing page for founder builds and the web alpha preview.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={founderMailto}
                  className="rounded-md bg-[#4f46ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#3f38e8]"
                >
                  Request founder macOS build
                </a>
                <a
                  href={webAlphaHref}
                  className="rounded-md border border-[#d9dcff] bg-white/72 px-5 py-3 text-sm font-semibold text-[#111312] transition hover:border-[#4f46ff] hover:text-[#4f46ff]"
                >
                  Preview web alpha
                </a>
              </div>
            </div>

            <div className="mt-16 grid gap-4 border-t border-[#d9ddda] pt-6 text-sm leading-6 text-[#5b6662] sm:grid-cols-3">
              <p>The product is the app, not this testing website.</p>
              <p>Founder testers help harden import, AI edit, export, and private embed workflows.</p>
              <p>No public promise of perfect PDF/photo conversion or support for every file.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e2e5e3] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <Eyebrow>Product screenshots</Eyebrow>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#111312] sm:text-4xl">
                See the score editor and AI assistant working together.
              </h2>
              <p className="mt-5 text-base leading-7 text-[#4b5551]">
                This is the current web alpha workspace: a rendered score editor on the left, notation controls across the top, and an AI assistant panel on the right showing an applied transposition edit.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {screenshotHighlights.map((item) => (
                <div key={item.title} className="rounded-md border border-[#e0e4e2] bg-[#fafbfb] p-4">
                  <h3 className="text-sm font-semibold text-[#111312]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5b6662]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <figure className="mt-8 overflow-hidden rounded-md border border-[#d9dcff] bg-[#f7f8f8] shadow-[0_24px_80px_-52px_rgba(79,70,255,0.55)]">
            <img
              src="/screenshots/ai-edit-preview.png"
              alt="nex-note web alpha showing the score editor and AI assistant"
              className="block h-auto w-full"
            />
            <figcaption className="border-t border-[#e1e4f6] bg-white px-4 py-3 text-xs leading-5 text-[#5b6662]">
              Current web alpha screenshot: score editor, notation toolbar, playback controls, and AI assistant applying a transposition edit.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <div>
          <Eyebrow>First paid workflow</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#111312] sm:text-4xl">
            Private archive to AI edit, export, and embed.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#4b5551]">{paidWorkflow}</p>
        </div>
        <div className="grid gap-2">
          {appLoop.map((item, index) => (
            <div key={item} className="grid grid-cols-[2rem_1fr] gap-4 border-t border-[#dfe3e1] py-4">
              <span className="text-sm font-semibold tabular-nums text-[#4f46ff]">{String(index + 1).padStart(2, "0")}</span>
              <p className="text-sm leading-6 text-[#303835]">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e2e5e3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div>
            <Eyebrow>What it is</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold text-[#111312]">A focused app-product for private music work.</h2>
            <p className="mt-5 text-base leading-7 text-[#4b5551]">
              nex-note is for musicians who already have legitimate score or tab material and need a safer workflow around import, AI edits, arrangement help, validation, export, and private sharing. The web alpha at <span className="font-semibold text-[#111312]">/nex-note-app</span> is only a preview surface.
            </p>
          </div>
          <div className="grid gap-3 text-sm leading-6 text-[#303835]">
            <p className="rounded-md border border-[#e0e4e2] bg-[#fafbfb] p-4">
              <strong>Founder app build:</strong> early macOS builds for real-world testing with compatibility notes and honest limitations.
            </p>
            <p className="rounded-md border border-[#e0e4e2] bg-[#fafbfb] p-4">
              <strong>AI editor:</strong> ask for cleanup or arranging changes, inspect the proposed diff, then apply only after preview.
            </p>
            <p className="rounded-md border border-[#e0e4e2] bg-[#fafbfb] p-4">
              <strong>Private embeds:</strong> publish selected validated scores for students, members, or collaborators without turning the app into a public score host.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
        <div>
          <Eyebrow>Who it is for</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold text-[#111312]">Founder testers with real private music workflows.</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {audience.map((item) => (
            <p key={item} className="rounded-md border border-[#e0e4e2] bg-white p-4 text-sm leading-6 text-[#303835]">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e1e4f6] bg-[#f1f2ff]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <div>
            <Eyebrow>File rules</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold text-[#111312]">Safe and legal score usage.</h2>
            <p className="mt-5 text-base leading-7 text-[#4b5551]">
              Founder testing accepts only files you can legally process. nex-note will not accept copyrighted scores without permission and does not grant rights to copy, convert, distribute, or commercialize someone else's music.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {testerRules.map((rule) => (
              <div key={rule} className="rounded-md border border-[#d9dcff] bg-white/78 p-4 text-sm font-semibold text-[#302b8f]">
                {rule}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10">
        <Eyebrow>Formats</Eyebrow>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {supportedFormats.map((group) => (
            <article key={group.title} className="rounded-md border border-[#e0e4e2] bg-white p-5">
              <h3 className="text-lg font-semibold text-[#111312]">{group.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <span key={item} className="rounded-md bg-[#ecebff] px-2.5 py-1.5 text-sm font-semibold text-[#3831a3]">
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:px-10">
        <div className="rounded-md border border-[#dfe3e1] bg-white p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-[#111312]">Get the founder app build</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5b6662]">
                Current builds are founder alpha builds for macOS. They may be unsigned or ad-hoc signed until Apple Developer ID signing and notarization are completed. Developers can also build locally from <span className="font-semibold text-[#111312]">devel</span> with <span className="font-semibold text-[#111312]">npm run electron:build</span>.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={founderMailto}
                className="inline-flex rounded-md bg-[#4f46ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#3f38e8]"
              >
                Request build
              </a>
              <a
                href={webAlphaHref}
                className="inline-flex rounded-md border border-[#d9dcff] px-5 py-3 text-sm font-semibold text-[#111312] transition hover:border-[#4f46ff] hover:text-[#4f46ff]"
              >
                Preview web alpha
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
