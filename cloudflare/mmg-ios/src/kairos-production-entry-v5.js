import runtime, { KairosProject } from "./kairos-production-entry-v4.js";

const BUILD = "kairos-production-entry-20260713-5";
const CONTENT_ONLY_RULE = `\n\nNON-NEGOTIABLE CONTENT-ONLY EXECUTION BOUNDARY:\nTreat the current Shopify homepage front end as immutable. Do not add, remove, replace, reorder, resize, recolor, restyle, or reposition any section, block, card, pill, button, image container, heading, navigation element, animation, spacing rule, typography rule, CSS declaration, Liquid markup structure, or responsive behavior. Do not create a new homepage section or stylesheet. Do not add visuals. Preserve the rendered appearance exactly. Allowed changes are limited to existing editable text and labels, verified URLs, metadata, accessibility attributes, routing, technical corrections, and backend behavior that does not alter the rendered design. If the requested outcome requires a visual or structural change, return a proposal instead of executing it.`;
const EMPTY_PROMPT_PATCH = `<script>(()=>{const c=()=>{const t=document.querySelector('#objective');if(t){t.value='';t.removeAttribute('placeholder');t.setAttribute('autocomplete','off')}const h=document.querySelector('#job-hint');if(h)h.textContent='Enter only the exact content or backend change you want Kairos to make.';const l=document.querySelector('#objective-label');if(l)l.textContent='Describe the requested change'};const r=()=>{queueMicrotask(c);setTimeout(c,0)};document.addEventListener('DOMContentLoaded',()=>{c();document.querySelector('#job-type')?.addEventListener('change',r);['#refine-version','#restore-hybrid','#request-refinement','#new-job','#retry-job','#revise'].forEach(s=>document.querySelector(s)?.addEventListener('click',r))})})();</script>`;

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/shopify/staging/plan/jobs") {
      try {
        const payload = await request.clone().json();
        if (typeof payload?.objective === "string" && !payload.objective.includes("NON-NEGOTIABLE CONTENT-ONLY EXECUTION BOUNDARY")) {
          payload.objective += CONTENT_ONLY_RULE;
          request = new Request(request, {
            body: JSON.stringify(payload),
            headers: new Headers(request.headers),
          });
        }
      } catch {}
    }

    const response = await runtime.fetch(request, env, ctx);
    if (request.method !== "GET" || url.pathname !== "/web-003.html") return response;
    if (!response.headers.get("Content-Type")?.includes("text/html")) return response;

    const html = await response.text();
    const patched = html.includes("website-production-empty-prompt-patch")
      ? html
      : html.replace("</body>", `<!-- website-production-empty-prompt-patch -->${EMPTY_PROMPT_PATCH}</body>`);
    const headers = new Headers(response.headers);
    headers.set("Content-Length", String(new TextEncoder().encode(patched).length));
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Homepage-Mode", "content-only");
    return new Response(patched, { status: response.status, statusText: response.statusText, headers });
  },
};
