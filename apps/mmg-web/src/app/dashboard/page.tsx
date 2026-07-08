const modules = [
  'Knowledge Library',
  'Purchases and Downloads',
  'Kairos Assistant',
  'Projects',
  'Subscription Review'
];

export default function CustomerDashboardPage() {
  return (
    <main>
      <section className="mmg-shell">
        <p className="mmg-kicker">Customer Dashboard</p>
        <h1>Personalized MMG workspace.</h1>
        <div className="mmg-card-grid">
          {modules.map((module) => (
            <article className="mmg-card" key={module}>
              <h2>{module}</h2>
              <p className="mmg-muted">Module placeholder for authenticated customer experience.</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
