# Live Manuscript Button-Chain Proof

Kairos manuscript deployment is not considered operational merely because files deploy or health endpoints respond.

The production deployment must run the deployed Command Center in mobile WebKit and prove the following user-visible sequence:

1. Open the Content operating center.
2. Tap **Open Manuscript Studio**.
3. Confirm the Manuscript Studio overlay opens.
4. Enter a publication title and manuscript text.
5. Tap **Continue to Production Intake**.
6. Confirm the production-intake result renders.
7. Confirm the project-setup panel mounts.
8. Enter author, publication title, and publishing service.
9. Attach a PNG cover.
10. Tap **Save Setup & Assign Production**.
11. Observe the cover upload request.
12. Observe the production-assignment request.
13. Confirm the UI renders `assigned-to-production` and the next action.

The deployment test uses the real deployed HTML, CSS, JavaScript, module loading, event handlers, rendering, and mobile WebKit engine. API requests for the synthetic test project are intercepted inside the browser, so the proof does not create production projects or modify Shopify.

A version-string check, source-file grep, health endpoint, or mocked controller-only test is not sufficient by itself.
