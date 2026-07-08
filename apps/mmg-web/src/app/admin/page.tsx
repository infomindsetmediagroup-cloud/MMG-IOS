import { CommandCenter } from "@/components/command-center/CommandCenter";
import { getDevelopmentCommandCenterTelemetry } from "@/lib/command-center/liveOperations";

export default function AdminPage() {
  const telemetry = getDevelopmentCommandCenterTelemetry();

  return (
    <main>
      <section className="mmg-shell command-center-shell">
        <p className="mmg-kicker">Admin</p>
        <h1>MMG Command Center.</h1>
        <p className="mmg-muted command-center-intro">
          Live operations shell using state-backed development telemetry. Production telemetry must replace adapters before operational status.
        </p>
        <CommandCenter telemetry={telemetry} />
      </section>
    </main>
  );
}
