BEGIN;

CREATE OR REPLACE FUNCTION mmg_commerce_incident_severity_rank(value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE value
    WHEN 'SEV1' THEN 1
    WHEN 'SEV2' THEN 2
    WHEN 'SEV3' THEN 3
    WHEN 'SEV4' THEN 4
    ELSE 999
  END;
$$;

CREATE OR REPLACE FUNCTION mmg_guard_commerce_incident_severity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state NOT IN ('resolved', 'closed')
     AND mmg_commerce_incident_severity_rank(NEW.severity)
       > mmg_commerce_incident_severity_rank(OLD.severity) THEN
    NEW.severity := OLD.severity;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mmg_commerce_incident_severity_guard
  ON mmg_commerce_incidents;

CREATE TRIGGER mmg_commerce_incident_severity_guard
BEFORE UPDATE OF severity, state ON mmg_commerce_incidents
FOR EACH ROW
EXECUTE FUNCTION mmg_guard_commerce_incident_severity();

CREATE INDEX IF NOT EXISTS mmg_commerce_e2e_runs_release_environment_idx
  ON mmg_commerce_e2e_runs (release_id, environment, completed_at DESC)
  WHERE status = 'passed' AND completed_at IS NOT NULL;

ALTER TABLE mmg_commerce_health_snapshots
  DROP CONSTRAINT IF EXISTS mmg_commerce_health_snapshots_release_fk;
ALTER TABLE mmg_commerce_health_snapshots
  ADD CONSTRAINT mmg_commerce_health_snapshots_release_fk
  FOREIGN KEY (release_id)
  REFERENCES mmg_commerce_releases(release_id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE mmg_commerce_consistency_audits
  DROP CONSTRAINT IF EXISTS mmg_commerce_consistency_audits_release_fk;
ALTER TABLE mmg_commerce_consistency_audits
  ADD CONSTRAINT mmg_commerce_consistency_audits_release_fk
  FOREIGN KEY (release_id)
  REFERENCES mmg_commerce_releases(release_id)
  ON DELETE SET NULL
  NOT VALID;

COMMIT;
