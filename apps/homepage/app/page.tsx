import content from "./content";
import { samples } from "./samples";
import { Logo } from "./brand";
import { featureIcon } from "./icons";
import { CodeTabs } from "./code-tabs";

const GITHUB_URL = "https://github.com/satvik-1203/open-browser";

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

interface CtaLinkProps {
  href: string;
  className: string;
  children: React.ReactNode;
}

function CtaLink({ href, className, children }: CtaLinkProps) {
  const external = isExternal(href);
  return (
    <a
      href={href}
      className={className}
      {...(external
        ? { target: "_blank", rel: "noreferrer noopener" }
        : {})}
    >
      {children}
    </a>
  );
}

export default function Page() {
  const { hero, stats, features, adapters, howItWorks, finalCta, footer } =
    content;

  return (
    <>
      <header className="site-header">
        <div className="container">
          <a className="brand-link" href="#top" aria-label="Open Browser home">
            <Logo size={26} />
          </a>
          <nav className="nav" aria-label="Primary">
            <div className="nav-links">
              <a className="nav-link" href="#features">
                Features
              </a>
              <a className="nav-link" href="#quickstart">
                Quickstart
              </a>
              <a className="nav-link" href="#docs">
                Docs
              </a>
              <a
                className="nav-link"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                GitHub
              </a>
            </div>
            <CtaLink href={hero.primaryCta.href} className="btn btn-primary btn-sm nav-cta">
              {hero.primaryCta.label}
            </CtaLink>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="hero" aria-label="Introduction">
          <div className="container">
            <div className="hero-inner">
              <p className="eyebrow">{hero.eyebrow}</p>
              <h1 className="hero-headline">{hero.headline}</h1>
              <p className="hero-sub">{hero.subhead}</p>
              <div className="hero-actions">
                <CtaLink href={hero.primaryCta.href} className="btn btn-primary btn-lg">
                  {hero.primaryCta.label}
                </CtaLink>
                <CtaLink href={hero.secondaryCta.href} className="btn btn-secondary btn-lg">
                  {hero.secondaryCta.label}
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="stats" aria-label="Key numbers">
          <div className="container">
            <div className="stats-grid">
              {stats.map((stat) => (
                <div className="stat" key={stat.label}>
                  <div className="stat-value">{stat.value}</div>
                  <div className="stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="section" id="features" aria-label="Features">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Features</p>
              <h2 className="section-title">
                Everything you need to run browsers at scale
              </h2>
              <p className="section-sub">
                A complete, self-hostable platform for launching, controlling,
                and observing headless Chromium.
              </p>
            </div>
            <div className="features-grid">
              {features.map((feature) => {
                const Icon = featureIcon(feature.id);
                return (
                  <article className="feature-card" key={feature.id}>
                    <span className="feature-icon">
                      <Icon size={22} />
                    </span>
                    <h3 className="feature-title">{feature.title}</h3>
                    <p className="feature-tagline">{feature.tagline}</p>
                    <p className="feature-desc">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section" aria-label="How it works">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">How it works</p>
              <h2 className="section-title">From zero to thousands in three steps</h2>
            </div>
            <ol className="steps">
              {howItWorks.map((item) => (
                <li className="step" key={item.step}>
                  <span className="step-num">{item.step}</span>
                  <h3 className="step-title">{item.title}</h3>
                  <p className="step-desc">{item.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Code / quickstart */}
        <section className="section code-section" id="quickstart" aria-label="Quickstart code examples">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Quickstart</p>
              <h2 className="section-title">A browser in a few lines</h2>
              <p className="section-sub">
                Deploy the server, add the SDK, and connect your favorite
                automation framework over CDP.
              </p>
            </div>
            <CodeTabs samples={samples} />
          </div>
        </section>

        {/* Adapters */}
        <section className="section" aria-label="Storage adapters">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Storage adapters</p>
              <h2 className="section-title">Recordings land in your bucket</h2>
              <p className="section-sub">
                Session recordings and artifacts sync to the object store you
                already use. The adapter interface is pluggable.
              </p>
            </div>
            <div className="adapters-grid">
              {adapters.map((adapter) => (
                <div className="adapter" key={adapter.name}>
                  <span className="adapter-name">{adapter.name}</span>
                  <span className="adapter-note">{adapter.note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="section final-cta" id="docs" aria-label="Get started">
          <div className="container">
            <div className="final-inner">
              <h2 className="final-headline">{finalCta.headline}</h2>
              <p className="final-sub">{finalCta.subhead}</p>
              <div className="final-actions">
                <CtaLink href={finalCta.primaryCta.href} className="btn btn-primary btn-lg">
                  {finalCta.primaryCta.label}
                </CtaLink>
                <CtaLink href={finalCta.secondaryCta.href} className="btn btn-secondary btn-lg">
                  {finalCta.secondaryCta.label}
                </CtaLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer" aria-label="Site footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Logo size={24} />
              <p className="footer-tagline">{footer.tagline}</p>
            </div>
            <nav className="footer-links" aria-label="Footer">
              {footer.links.map((link) => (
                <CtaLink key={link.label} href={link.href} className="footer-link">
                  {link.label}
                </CtaLink>
              ))}
            </nav>
          </div>
          <p className="footer-note">{footer.note}</p>
        </div>
      </footer>
    </>
  );
}
