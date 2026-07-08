# MMG Web Route Manifest

## Public Routes
- `/`: public ecosystem homepage.
- `/knowledge`: Knowledge Library landing page.
- `/kairos`: Kairos public assistant and education page.
- `/creator-education`: creator education hub.
- `/products`: product and digital download catalog.
- `/founder`: founder story and brand trust page.

## Customer Routes
- `/dashboard`: authenticated customer dashboard.
- `/dashboard/library`: customer downloads and knowledge access.
- `/dashboard/projects`: customer project workspace.
- `/dashboard/kairos`: authenticated Kairos assistant surface.
- `/dashboard/subscription`: subscription and content review controls.

## Admin Routes
- `/admin`: executive command center.
- `/admin/publishing`: product publishing workflow.
- `/admin/customers`: customer intelligence overview.
- `/admin/kairos`: runtime health and department controls.
- `/admin/releases`: release package and QA workflow.
- `/admin/trust`: audit and approval trail.

## API Routes
- `/api/kairos`: Kairos runtime gateway.
- `/api/health`: runtime health check.

## Implementation Rule
Every customer or admin route must enforce authentication before exposing private data or operational controls.
