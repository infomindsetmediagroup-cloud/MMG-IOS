/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useCallback, useEffect, useMemo, useState} from 'preact/hooks';

const KAIROS_BASE_URL = 'https://mmg-ios.info-mindsetmediagroup.workers.dev';
const PROJECTS_ENDPOINT = `${KAIROS_BASE_URL}/api/kairos/customer/projects`;

export default function extension() {
  render(<CustomerPortal />, document.body);
}

function CustomerPortal() {
  const [state, setState] = useState({status: 'loading', projects: [], error: null});

  const load = useCallback(async () => {
    setState((current) => ({...current, status: 'loading', error: null}));
    try {
      const token = await shopify.sessionToken.get();
      if (!token) throw new Error('Shopify customer authentication is unavailable.');
      const response = await fetch(PROJECTS_ENDPOINT, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        const code = payload?.error?.code || `HTTP_${response.status}`;
        throw new Error(code);
      }
      setState({status: 'ready', projects: Array.isArray(payload.projects) ? payload.projects : [], error: null});
    } catch (error) {
      console.error('MMG Customer Portal failed to load Kairos projects.', error);
      setState({status: 'error', projects: [], error});
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summarizeProjects(state.projects), [state.projects]);

  return (
    <s-page
      heading="Customer Portal"
      subheading="Projects, approvals, progress, deliverables, and secure account resources in one place."
    >
      <s-button slot="primary-action" onClick={load} loading={state.status === 'loading'}>
        Refresh
      </s-button>
      <s-button
        slot="secondary-action"
        onClick={() => shopify.navigation.navigate('shopify:customer-account/orders')}
      >
        Orders
      </s-button>

      <s-stack direction="block" gap="base">
        <s-banner heading="Mindset Media Group™ secure workspace" tone="info">
          <s-text>
            Kairos uses your authenticated Shopify Customer Account session to show only projects assigned to your customer identity.
          </s-text>
        </s-banner>

        {state.status === 'loading' ? <LoadingState /> : null}
        {state.status === 'error' ? <ErrorState error={state.error} onRetry={load} /> : null}

        {state.status === 'ready' ? (
          <s-section heading="Workspace overview">
            <s-stack direction="inline" gap="base">
              <s-badge tone="info">{summary.total} projects</s-badge>
              <s-badge tone={summary.actionRequired > 0 ? 'warning' : undefined}>{summary.actionRequired} need action</s-badge>
              <s-badge tone="success">{summary.deliverables} deliverables</s-badge>
            </s-stack>
          </s-section>
        ) : null}

        {state.status === 'ready' && state.projects.length === 0 ? <EmptyState /> : null}

        {state.status === 'ready' && state.projects.length > 0 ? (
          <s-section heading="Your projects">
            <s-stack direction="block" gap="base">
              {state.projects.map((project) => (
                <ProjectCard key={project.projectId} project={project} />
              ))}
            </s-stack>
          </s-section>
        ) : null}

        <s-section heading="Account resources">
          <s-stack direction="block" gap="small-200">
            <s-text>Digital product purchases remain protected by Shopify Digital Products and your order entitlements.</s-text>
            <s-link href="https://themindsetmediagroup.com/pages/project-guide" target="_blank">
              Project Guide
            </s-link>
            <s-link href="https://themindsetmediagroup.com/pages/customer-service" target="_blank">
              Customer Service
            </s-link>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

function ProjectCard({project}) {
  const approvals = Array.isArray(project.approvals) ? project.approvals : [];
  const deliverables = Array.isArray(project.deliverables) ? project.deliverables : [];
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const progress = Number.isFinite(project.progress?.percent) ? project.progress.percent : 0;

  return (
    <s-card>
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base" inlineAlignment="space-between">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{project.title || 'MMG project'}</s-text>
            <s-text color="subdued">{project.statusLabel || 'Project in progress'}</s-text>
          </s-stack>
          <s-badge tone={project.state === 'blocked' ? 'critical' : project.state === 'awaiting_approval' ? 'warning' : 'info'}>
            {progress}%
          </s-badge>
        </s-stack>

        <s-text color="subdued">Stage: {project.progress?.stage || project.state || 'in progress'}</s-text>

        {project.blockedReason ? (
          <s-banner heading="Action required" tone="critical">
            <s-text>{project.blockedReason}</s-text>
          </s-banner>
        ) : null}

        {project.nextAction ? (
          <s-banner heading="Next step" tone={project.nextAction.type === 'review_approval' ? 'warning' : 'info'}>
            <s-text>{project.nextAction.label}</s-text>
          </s-banner>
        ) : null}

        {pendingApprovals.length > 0 ? (
          <s-stack direction="inline" gap="small-200">
            {pendingApprovals.map((approval) => (
              <s-badge key={approval.gate} tone="warning">Approval: {formatGate(approval.gate)}</s-badge>
            ))}
          </s-stack>
        ) : null}

        {deliverables.length > 0 ? (
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Approved deliverables</s-text>
            {deliverables.map((deliverable) => (
              <s-text key={deliverable.deliverableId} color="subdued">
                {deliverable.type || 'Deliverable'} · {deliverable.status || 'available'} · v{deliverable.version || 1}
              </s-text>
            ))}
          </s-stack>
        ) : null}
      </s-stack>
    </s-card>
  );
}

function LoadingState() {
  return (
    <s-section heading="Loading your workspace">
      <s-stack direction="inline" gap="base" blockAlignment="center">
        <s-spinner size="base" />
        <s-text>Connecting your authenticated account to Kairos…</s-text>
      </s-stack>
    </s-section>
  );
}

function ErrorState({error, onRetry}) {
  const message = String(error?.message || 'CUSTOMER_PORTAL_UNAVAILABLE');
  const configurationError = message.includes('AUTH_NOT_CONFIGURED');
  return (
    <s-banner heading="Customer Portal could not be loaded" tone="critical">
      <s-stack direction="block" gap="base">
        <s-text>
          {configurationError
            ? 'The secure Kairos authentication bridge is not configured yet. No project data was exposed.'
            : 'Your secure workspace could not be loaded. No account or project data was changed.'}
        </s-text>
        <s-button onClick={onRetry}>Try again</s-button>
      </s-stack>
    </s-banner>
  );
}

function EmptyState() {
  return (
    <s-section heading="No active projects yet">
      <s-stack direction="block" gap="base">
        <s-text>
          Service projects will appear here after your order and project intake are connected to Kairos.
        </s-text>
        <s-link href="https://themindsetmediagroup.com/pages/project-guide" target="_blank">
          Review the Project Guide
        </s-link>
      </s-stack>
    </s-section>
  );
}

function summarizeProjects(projects) {
  return projects.reduce((summary, project) => {
    summary.total += 1;
    if (project.state === 'blocked' || project.state === 'awaiting_approval' || project.nextAction) summary.actionRequired += 1;
    summary.deliverables += Array.isArray(project.deliverables) ? project.deliverables.length : 0;
    return summary;
  }, {total: 0, actionRequired: 0, deliverables: 0});
}

function formatGate(value) {
  return String(value || 'review').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
