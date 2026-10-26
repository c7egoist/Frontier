import site from '../site.config.js'
import { IconMail } from '../components/Icons.jsx'
import { Section } from '../components/ui.jsx'

/* Plain-language policy for a site that collects nothing.
   Before you publish: replace [Studio name] in src/site.config.js and read the checklist
   at the bottom of website/README.md. */

const SECTIONS = [
  {
    heading: '1. Who this policy covers',
    body: [
      `This policy covers this website and the downloadable demo build of ${site.name}, provided by ${site.studio} (“we”, “us”).`,
      'It explains what information is handled when you visit the site, download a build, or email us.',
    ],
  },
  {
    heading: '2. What the website collects',
    body: [
      'Nothing. The site runs as static files and sets no cookies, uses no analytics, advertising or tracking scripts, and builds no profile of you.',
      'No account is required to read the site or download a build, so there is nothing for us to sign you into.',
    ],
  },
  {
    heading: '3. Downloads',
    body: [
      `Builds are served from ${site.privacy.host}. Downloads are ordinary file requests; we do not gate them behind an email form and we do not ask you to register.`,
      'We publish a SHA-256 checksum next to each build so you can verify the file you received is the file we uploaded.',
    ],
  },
  {
    heading: '4. The demo build',
    body: [
      'The demo build contains no analytics or telemetry. It does not report crashes, hardware, playtime or session data back to us.',
      'Any settings or best times the build writes stay on your own machine, in the folder the build runs from.',
    ],
  },
  {
    heading: '5. Email',
    body: [
      `If you email us at ${site.email}, we receive your address and whatever you write. We use it only to reply and to keep a record of the conversation.`,
      'We do not add your address to a mailing list unless you explicitly ask us to, and we do not sell or share it with anyone.',
    ],
  },
  {
    heading: '6. Third parties',
    body: [
      'The site links out to other services (for example, a video host if a reel is embedded elsewhere). Those services have their own policies; we are not responsible for what they do once you leave this site.',
    ],
  },
  {
    heading: '7. Children',
    body: [
      'The site and the demo are not directed at children, and we do not knowingly collect information from anyone. If a child has emailed us, contact us and we will delete the message.',
    ],
  },
  {
    heading: '8. Your rights',
    body: [
      'You can ask us what we hold, ask for a copy, ask us to correct it, or ask us to delete it. Email the address below and we will action it.',
    ],
  },
  {
    heading: '9. Changes',
    body: [
      'If this policy changes, the “last updated” date at the top changes with it. Material changes will also be noted on the site.',
    ],
  },
]

export default function Privacy() {
  return (
    <>
      <section className="bloom relative overflow-hidden border-b border-hair">
        <div className="grid-bg mask-fade-b absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-10">
          <p className="meta">Legal</p>
          <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.2rem)] leading-[0.98] font-bold tracking-[-0.03em] text-ink uppercase">
            Privacy policy
          </h1>
          <p className="meta mt-4">Last updated {site.privacy.lastUpdated}</p>
        </div>
      </section>

      <Section>
        <div className="max-w-2xl">
          {SECTIONS.map((section) => (
            <div key={section.heading} className="mb-9">
              <h2 className="font-display text-[16px] font-semibold text-ink">{section.heading}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-[13.5px] leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <div className="card p-6">
            <p className="meta">Questions</p>
            <p className="mt-2 text-[14px] text-ink">Anything about this policy, or about your data.</p>
            <a href={`mailto:${site.email}`} className="btn btn-primary mt-5">
              <IconMail className="h-4 w-4" />
              {site.email}
            </a>
          </div>
        </div>
      </Section>
    </>
  )
}
