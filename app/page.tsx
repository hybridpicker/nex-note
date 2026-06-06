const founderMailto =
  "mailto:lukas@schoensgibl.com?subject=nex-note%20founder%20app%20build&body=Hi%20Lukas%2C%0A%0AI%20want%20to%20test%20the%20nex-note%20downloadable%20app.%0A%0AI%20am%20a%3A%20%5Bmusic%20teacher%2Fguitar%20teacher%2Fchoir%20director%2Fschool%2Farranger%2Fmusician%5D%0AMy%20main%20file%20formats%20are%3A%20%5BMusicXML%2FMXL%2FMSCZ%2FPDF%2Fphoto%2FGuitarPro%2FMIDI%5D%0AI%20can%20submit%20files%20that%20are%3A%20%5Bown%2Fself-created%2Flicensed%2Fpublic-domain%5D%0AI%20need%20nex-note%20for%3A%20%5Bprivate%20archive%2FAI%20editing%2Farranging%2Fexport%2Fprivate%20embeds%5D%0A";

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

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#101318]">
      <section className="relative flex min-h-[92vh] items-end overflow-hidden bg-[#101318]">
        <img
          src="/screenshots/ai-edit-preview.png"
          alt="nex-note score cleanup workspace"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.54]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,19,24,0.2)_0%,rgba(16,19,24,0.72)_58%,rgba(16,19,24,0.96)_100%)]" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-12 pt-20 sm:px-8 lg:px-10">
          <nav className="absolute left-5 right-5 top-5 flex items-center justify-between sm:left-8 sm:right-8 lg:left-10 lg:right-10">
            <img src="/brand/nex-note-logo.png" alt="nex-note" className="h-9 w-auto rounded-sm bg-white/92 px-2 py-1" />
            <a
              href={founderMailto}
              className="rounded-md border border-white/35 bg-white/12 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Request app build
            </a>
          </nav>

          <div className="max-w-3xl text-white">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#9ee8dc]">
              Downloadable local-first music app
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              nex-note
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/86">
              nex-note is a downloadable app for private scores, tabs, AI-assisted editing, arrangement help, validation, export, and private embeds. This website is a test landing page for founder builds and the web alpha preview.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={founderMailto}
                className="rounded-md bg-[#9ee8dc] px-5 py-3 text-sm font-bold text-[#101318] transition hover:bg-[#b9fff5]"
              >
                Request founder macOS build
              </a>
              <a
                href="/nex-note-app"
                className="rounded-md border border-white/34 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/18"
              >
                Preview web alpha
              </a>
            </div>
          </div>

          <div className="grid gap-3 border-t border-white/18 pt-5 text-sm text-white/76 sm:grid-cols-3">
            <p>The product is the app, not this testing website.</p>
            <p>Founder testers help harden real import, AI edit, export, and private embed workflows.</p>
            <p>No public promise of perfect PDF/photo conversion or support for every file.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4a635f]">First paid workflow</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#101318] sm:text-4xl">
              Private archive to AI edit, export, and embed.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#48515c]">{paidWorkflow}</p>
          </div>
          <div className="grid gap-3">
            {appLoop.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-md border border-[#dfe4ea] bg-white p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#20312f] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-[#333b45]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div>
            <h2 className="text-3xl font-semibold text-[#101318]">What nex-note is</h2>
            <p className="mt-4 text-base leading-7 text-[#586270]">
              nex-note is an app-product for musicians who already have legitimate score or tab material and need a safer workflow around import, AI edits, arrangement help, validation, export, and private sharing. The web alpha at <span className="font-semibold">/nex-note-app</span> is only a preview surface.
            </p>
          </div>
          <div className="grid gap-3 text-sm leading-6 text-[#333b45]">
            <p className="rounded-md border border-[#dfe4ea] bg-[#f8fafb] p-4">
              <strong>Founder app build:</strong> early macOS builds for real-world testing with compatibility notes and honest limitations.
            </p>
            <p className="rounded-md border border-[#dfe4ea] bg-[#f8fafb] p-4">
              <strong>AI editor:</strong> ask for cleanup or arranging changes, inspect the proposed diff, then apply only after preview.
            </p>
            <p className="rounded-md border border-[#dfe4ea] bg-[#f8fafb] p-4">
              <strong>Private embeds:</strong> publish selected validated scores for students, members, or collaborators without turning the app into a public score host.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4a635f]">Who it is for</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#101318]">Founder testers with real private music workflows.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {audience.map((item) => (
              <p key={item} className="rounded-md border border-[#dfe4ea] bg-white p-4 text-sm leading-6 text-[#333b45]">
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#eef3f2]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-3xl font-semibold text-[#101318]">Safe and legal score usage</h2>
              <p className="mt-4 text-base leading-7 text-[#586270]">
                Founder testing accepts only files you can legally process. nex-note will not accept copyrighted scores without permission and does not grant rights to copy, convert, distribute, or commercialize someone else's music.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {testerRules.map((rule) => (
                <div key={rule} className="rounded-md border border-[#cfdad7] bg-white p-4 text-sm font-semibold text-[#20312f]">
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-4 md:grid-cols-3">
          {supportedFormats.map((group) => (
            <article key={group.title} className="rounded-md border border-[#dfe4ea] bg-white p-5">
              <h3 className="text-lg font-semibold text-[#101318]">{group.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <span key={item} className="rounded-md bg-[#f1f4f7] px-2.5 py-1.5 text-sm font-semibold text-[#333b45]">
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-8 lg:px-10">
        <div className="rounded-md bg-[#101318] p-6 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Get the founder app build</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/74">
                Current builds are founder alpha builds for macOS. They may be unsigned or ad-hoc signed until Apple Developer ID signing and notarization are completed. Developers can also build locally from <span className="font-semibold">devel</span> with <span className="font-semibold">npm run electron:build</span>.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={founderMailto}
                className="inline-flex rounded-md bg-[#9ee8dc] px-5 py-3 text-sm font-bold text-[#101318] transition hover:bg-[#b9fff5]"
              >
                Request build
              </a>
              <a
                href="/nex-note-app"
                className="inline-flex rounded-md border border-white/30 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/12"
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
