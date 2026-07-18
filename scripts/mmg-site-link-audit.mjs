#!/usr/bin/env node
const ORIGIN = (process.env.MMG_STOREFRONT_ORIGIN || 'https://themindsetmediagroup.com').replace(/\/+$/, '');
const MAX_URLS = Number(process.env.MMG_AUDIT_MAX_URLS || 500);
const CONCURRENCY = Number(process.env.MMG_AUDIT_CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.MMG_AUDIT_TIMEOUT_MS || 25000);
const OUT = process.env.MMG_AUDIT_OUTPUT || 'mmg-site-link-audit.json';
const UA = 'MMG-Kairos-Link-Auditor/1.0';
const origin = new URL(ORIGIN).origin;
const excluded = [/^\/account(?:\/|$)/, /^\/cart(?:\/|$)/, /^\/checkout(?:\/|$)/, /^\/search(?:\/|$)/, /^\/challenge(?:\/|$)/, /^\/cdn\//, /^\/apps\//];
const normalize = raw => { try { const u = new URL(raw, origin); if (u.origin !== origin) return null; u.hash=''; ['preview_theme_id','_pos','_sid','_ss','variant'].forEach(k=>u.searchParams.delete(k)); if ([...u.searchParams].length===0) u.search=''; u.pathname=u.pathname.replace(/\/{2,}/g,'/'); return u.href; } catch { return null; } };
const pathOf = u => new URL(u).pathname;
const isAuditable = u => u && !excluded.some(r=>r.test(pathOf(u)));
const decode = s => String(s||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip = s => decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
async function get(url){ const c=new AbortController(); const t=setTimeout(()=>c.abort(),TIMEOUT_MS); try { const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'cache-control':'no-cache','accept':'text/html,application/xml;q=.9,*/*;q=.8'},signal:c.signal}); return {r,text:await r.text()}; } finally {clearTimeout(t);} }
async function sitemapUrls(){ const seen=new Set(), pages=new Set(), q=[`${origin}/sitemap.xml`]; while(q.length){ const u=q.shift(); if(seen.has(u))continue; seen.add(u); const {r,text}=await get(u); if(!r.ok) throw new Error(`Sitemap ${u} returned ${r.status}`); const locs=[...text.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>decode(m[1].trim())); for(const loc of locs){ const n=normalize(loc); if(!n)continue; if(/\.xml(?:\?|$)/i.test(n)) q.push(n); else if(isAuditable(n)) pages.add(n); } } return pages; }
function extract(html){ const title=strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]); const h1=strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]); const main=(html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)||[])[1]||html; const mainText=strip(main); const links=[]; for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)){ const n=normalize(decode(m[1])); if(isAuditable(n)) links.push(n); } return {title,h1,mainTextLength:mainText.length,links:[...new Set(links)]}; }
async function mapLimit(items,fn){ const out=new Array(items.length); let i=0; await Promise.all(Array.from({length:Math.min(CONCURRENCY,items.length||1)},async()=>{while(true){const x=i++;if(x>=items.length)return;try{out[x]=await fn(items[x]);}catch(e){out[x]={url:items[x],error:String(e?.message||e)};}}})); return out; }
(async()=>{
 const sitemap=await sitemapUrls(); const queue=[normalize(origin+'/'),...sitemap].filter(Boolean); const discovered=new Set(queue), sources=new Map(); let cursor=0; const records=[];
 while(cursor<queue.length && cursor<MAX_URLS){ const batch=queue.slice(cursor,Math.min(queue.length,cursor+CONCURRENCY)); cursor+=batch.length; const rows=await mapLimit(batch,async url=>{ const {r,text}=await get(url); const parsed=extract(text); return {url,status:r.status,finalUrl:normalize(r.url)||r.url,redirected:(normalize(r.url)||r.url)!==url,contentType:r.headers.get('content-type')||'',...parsed}; });
  for(const row of rows){ records.push(row); for(const link of row.links||[]){ if(!sources.has(link))sources.set(link,new Set()); sources.get(link).add(row.url); if(!discovered.has(link)&&discovered.size<MAX_URLS){discovered.add(link);queue.push(link);} } }
 }
 const byUrl=new Map(records.map(r=>[r.url,r])); const broken=[], redirects=[], thin=[], orphaned=[];
 for(const r of records){ if(r.error || r.status>=400) broken.push(r); if(r.redirected) redirects.push(r); if(r.status<400 && /text\/html/i.test(r.contentType) && r.mainTextLength<180) thin.push(r); if(!sitemap.has(r.url)&&r.url!==normalize(origin+'/')) orphaned.push(r); }
 const unresolved=[]; for(const [target,srcs] of sources){ const r=byUrl.get(target); if(!r || r.error || r.status>=400) unresolved.push({target,status:r?.status??null,error:r?.error??null,sources:[...srcs]}); }
 const report={generatedAt:new Date().toISOString(),origin,limits:{maxUrls:MAX_URLS,concurrency:CONCURRENCY},summary:{sitemapUrls:sitemap.size,crawled:records.length,broken:broken.length,unresolvedInternalLinks:unresolved.length,redirects:redirects.length,thinPages:thin.length,reachableOutsideSitemap:orphaned.length},broken,unresolvedInternalLinks:unresolved,redirects,thinPages:thin,reachableOutsideSitemap:orphaned,records:records.map(r=>({...r,inbound:[...(sources.get(r.url)||[])]}))};
 require('node:fs').writeFileSync(OUT,JSON.stringify(report,null,2)); console.log(JSON.stringify(report.summary,null,2)); if(broken.length||unresolved.length) process.exitCode=2;
})().catch(e=>{console.error(e);process.exit(1)});
