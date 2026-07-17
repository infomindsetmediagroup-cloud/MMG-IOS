const BUILD="kairos-shopify-analytics-summary-20260715-1";
const anchor=document.querySelector("#command-status-anchor");
let loading=false;
let range="today";

if(anchor){
  const section=document.createElement("section");
  section.id="shopify-analytics-summary";
  section.className="shopify-summary";
  section.setAttribute("aria-label","Shopify analytics summary");
  section.innerHTML=`<header class="shopify-summary-head"><div><p class="eyebrow">Shopify Analytics</p><h2>Store performance</h2><small data-shopify-summary-status>Loading verified store data…</small></div><div class="shopify-summary-controls"><div role="group" aria-label="Analytics range">${[["today","Today"],["7d","7 Days"],["30d","30 Days"]].map(([id,label])=>`<button type="button" data-shopify-range="${id}" aria-pressed="${id===range}">${label}</button>`).join("")}</div><button type="button" data-shopify-refresh>Refresh</button></div></header><div class="shopify-summary-grid" data-shopify-summary-grid><article><span>Shopify analytics</span><strong>…</strong><small>Loading</small></article></div>`;
  anchor.insertAdjacentElement("afterend",section);
  section.querySelectorAll("[data-shopify-range]").forEach(button=>button.addEventListener("click",()=>{
    range=button.dataset.shopifyRange;
    section.querySelectorAll("[data-shopify-range]").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
    load();
  }));
  section.querySelector("[data-shopify-refresh]")?.addEventListener("click",load);
  load();
}

async function load(){
  const section=document.querySelector("#shopify-analytics-summary");
  if(!section||loading)return;
  loading=true;
  const status=section.querySelector("[data-shopify-summary-status]");
  const grid=section.querySelector("[data-shopify-summary-grid]");
  if(status)status.textContent="Refreshing verified store data…";
  try{
    const response=await fetch(`/api/analytics/shopify?range=${encodeURIComponent(range)}&compare=previous`,{cache:"no-store",credentials:"include",headers:{"X-MMG-Client-Build":BUILD}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body?.error?.message||"Shopify analytics are unavailable.");
    const metrics=(Array.isArray(body?.analytics?.metrics)?body.analytics.metrics:[]).filter(metric=>metric.status==="available").slice(0,4);
    if(status)status.textContent=`${rangeLabel()} · verified Shopify data`;
    if(grid)grid.innerHTML=metrics.length?metrics.map(metric=>`<article><span>${escapeHTML(metric.label||metric.id||"Metric")}</span><strong>${escapeHTML(metric.displayValue??metric.value??"—")}</strong><small>Verified ShopifyQL</small></article>`).join(""):`<article><span>Store analytics</span><strong>No available metrics</strong><small>Check Shopify reporting authorization.</small></article>`;
  }catch(error){
    if(status)status.textContent="Analytics need attention";
    if(grid)grid.innerHTML=`<article><span>Shopify analytics</span><strong>Unavailable</strong><small>${escapeHTML(error.message||"The analytics request failed.")}</small></article>`;
  }finally{loading=false;}
}

function rangeLabel(){return range==="today"?"Today":range==="7d"?"Last 7 days":"Last 30 days";}
function escapeHTML(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);}
window.KairosShopifyAnalyticsSummary={build:BUILD,refresh:load};
