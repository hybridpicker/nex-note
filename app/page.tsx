const founderMailto =
  "mailto:lukas@schoensgibl.com?subject=nex-note%20founder%20score%20test&body=Hi%20Lukas%2C%0A%0AI%20teach%20%5Binstrument%2Fensemble%5D.%20I%20have%20a%20score%20I%20own%20or%20am%20allowed%20to%20process%20and%20would%20like%20to%20test%20nex-note.%0A%0AThe%20format%20is%3A%20%5BMusicXML%2FMXL%2FMSCZ%2FPDF%2Fphoto%2FGuitarPro%5D%0AWhat%20I%20need%20back%3A%20%5Bparts%2Ftransposition%2FMIDI%2Fpractice%20pack%2Fcleanup%5D%0A";

const workflows = [
  {
    title: "AI Editor",
    text: "Ask for arrangement, cleanup, transposition, practice variants, or export checks directly inside the score editor.",
  },
  {
    title: "Private Archive",
    text: "Keep member, student, ensemble, or teaching scores in a private library with reliable import status and exports.",
  },
  {
    title: "Website Embed",
    text: "Embed private scores or tabs for students, bands, choirs, and members without exposing the full workspace.",
  },
];

const inputs = ["MusicXML", "MXL", "MSCZ", "GuitarPro", "MIDI", "PDF/photo with review"];
const outputs = ["AI edit preview", "Validated score", "Private embed", "Parts", "Practice MIDI", "MXL/MusicXML"];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#101318]">
      <section className="relative flex min-h-[92vh] items-end overflow-hidden bg-[#101318]">
        <img
          src="/screenshots/ai-edit-preview.png"
          alt="nex-note score cleanup workspace"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.54]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,19,24,0.18)_0%,rgba(16,19,24,0.72)_58%,rgba(16,19,24,0.96)_100%)]" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-12 pt-20 sm:px-8 lg:px-10">
          <nav className="absolute left-5 right-5 top-5 flex items-center justify-between sm:left-8 sm:right-8 lg:left-10 lg:right-10">
            <img src="/brand/nex-note-logo.png" alt="nex-note" className="h-9 w-auto rounded-sm bg-white/92 px-2 py-1" />
            <a
              href="/nex-note-app"
              className="rounded-md border border-white/35 bg-white/12 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Open alpha
            </a>
          </nav>

          <div className="max-w-3xl text-white">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#9ee8dc]">
              AI score workspace for musicians
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              A private music archive with an AI editor
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/86">
              nex-note is built to work like a practical assistant for musicians: open scores and tabs from your archive, ask for cleanup or arrangement changes, preview the result, and share private embeds with students, members, or collaborators.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={founderMailto}
                className="rounded-md bg-[#9ee8dc] px-5 py-3 text-sm font-bold text-[#101318] transition hover:bg-[#b9fff5]"
              >
                Send one test score
              </a>
              <a
                href="#workflow"
                className="rounded-md border border-white/34 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/18"
              >
                See workflow
              </a>
            </div>
          </div>

          <div className="grid gap-3 border-t border-white/18 pt-5 text-sm text-white/76 sm:grid-cols-3">
            <p>Built for teachers, guitar teachers, choirs, bands, small schools, arrangers, and private member libraries.</p>
            <p>Broad file support is a compatibility roadmap, not a fake promise. Unsupported files must fail clearly.</p>
            <p>Use only scores you own, created, licensed, or that are in the public domain.</p>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4a635f]">First paid workflow</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#101318] sm:text-4xl">
              Archive in, AI-assisted score workspace out.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#48515c]">
              The first version should prove the core loop: import real MusicXML/MXL/MSCZ/GuitarPro/MIDI material, store it privately, render it reliably, let the AI propose score-safe edits, and publish a private embed or practice pack when the output validates.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#dfe4ea] bg-white p-4">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#5a6572]">Inputs</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {inputs.map((item) => (
                  <span key={item} className="rounded-md bg-[#eef6f4] px-2.5 py-1.5 text-sm font-semibold text-[#20312f]">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-[#dfe4ea] bg-white p-4">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#5a6572]">Outputs</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {outputs.map((item) => (
                  <span key={item} className="rounded-md bg-[#f1f2ff] px-2.5 py-1.5 text-sm font-semibold text-[#26244b]">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {workflows.map((workflow) => (
            <article key={workflow.title} className="rounded-lg border border-[#dfe4ea] bg-white p-5">
              <h3 className="text-lg font-semibold text-[#101318]">{workflow.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#586270]">{workflow.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div>
            <h2 className="text-3xl font-semibold text-[#101318]">What the founder version includes</h2>
            <p className="mt-4 text-base leading-7 text-[#586270]">
              The current offer is not a generic notation editor subscription. It is early access to a private score archive and AI-assisted editing workflow while real score compatibility is being hardened.
            </p>
          </div>
          <div className="grid gap-3 text-sm leading-6 text-[#333b45]">
            <p className="rounded-lg border border-[#dfe4ea] bg-[#f8fafb] p-4">
              <strong>Founder archive test:</strong> send permitted scores or tabs from your real archive and get a working import, AI edit preview, validation report, and private embed where feasible.
            </p>
            <p className="rounded-lg border border-[#dfe4ea] bg-[#f8fafb] p-4">
              <strong>Pro Musician target:</strong> private library, AI edit preview, arrangement helpers, validation, practice packs, embeds, batch export, and priority compatibility fixes.
            </p>
            <p className="rounded-lg border border-[#dfe4ea] bg-[#f8fafb] p-4">
              <strong>Teacher and school packs:</strong> lesson material, parts, transpositions, MIDI, and member-only embeds for students, choirs, bands, and small schools.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="rounded-lg bg-[#101318] p-6 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Have a real private score archive?</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/74">
                Send a few scores or tabs you own, created, licensed, or can legally process. I will test whether nex-note can import, render, edit with AI preview, validate, export, and embed them privately.
              </p>
            </div>
            <a
              href={founderMailto}
              className="inline-flex rounded-md bg-[#9ee8dc] px-5 py-3 text-sm font-bold text-[#101318] transition hover:bg-[#b9fff5]"
            >
              Start founder test
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
