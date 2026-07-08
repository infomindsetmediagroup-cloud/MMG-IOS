const cards = [
  {
    title: 'Books and Knowledge',
    body: 'Practical digital products, creator education, and MMG knowledge assets.'
  },
  {
    title: 'Kairos Runtime',
    body: 'A secure server-side intelligence layer for public, customer, and admin surfaces.'
  },
  {
    title: 'Customer Dashboard',
    body: 'Personalized recommendations, downloads, subscription tools, and project continuity.'
  }
];

export default function HomePage() {
  return (
    <main>
      <section className="mmg-shell">
        <p className="mmg-kicker">Mindset Media Group</p>
        <h1>Books. AI. Business. Creator Education.</h1>
        <p className="mmg-muted">
          The public web foundation for the MMG ecosystem and Kairos operating intelligence.
        </p>

        <div className="mmg-card-grid">
          {cards.map((card) => (
            <article className="mmg-card" key={card.title}>
              <h2>{card.title}</h2>
              <p className="mmg-muted">{card.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
