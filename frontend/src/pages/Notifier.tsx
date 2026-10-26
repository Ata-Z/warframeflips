const FEATURES = [
  { title: "Any item, or a general filter", text: "Watch a specific mod, set, or arcane, or set a broad rule like \"any flip over 20p\"." },
  { title: "Straight to Discord", text: "Alerts land in your DMs or a server channel the moment a deal shows up." },
  { title: "No fake alerts", text: "Uses the same prices as this site, so bait buy orders and offline sellers never set it off." },
];

export default function Notifier() {
  return (
    <main>
      <section className="soon-hero">
        <span className="soon-badge">Coming soon</span>
        <h1>Custom notifiers on Discord</h1>
        <p className="lede">
          No need to be refreshing the site constantly, a Discord bot is on the way that watches the market for you and
          pings you when a flip matches your rules :D
        </p>
      </section>

      <div className="soon-grid">
        <ul className="soon-points">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>

        <figure className="discord-preview" aria-label="Example notification">
          <figcaption>Preview</figcaption>
          <div className="discord-msg">
            <div className="discord-avatar" aria-hidden="true">WF</div>
            <div>
              <div className="discord-head">
                <span className="discord-name">Warframe Flips</span>
                <span className="discord-tag">BOT</span>
                <span className="discord-time">Today at 21:04</span>
              </div>
              <div className="discord-embed">
                <strong>Arcane Energize: build R5 for +38p</strong>
                <span>Buy 21 copies for 142p, sell R5 to a buyer at 180p</span>
                <span className="muted">Matched your rule: arcanes, profit ≥ 30p</span>
              </div>
            </div>
          </div>
        </figure>
      </div>
    </main>
  );
}
