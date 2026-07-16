(function(){
  const BUILD='kairos-website-step-one-transport-20260715-1';
  const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
  const STATE_KEY='kairos.website.operational-flow.v2';
  const MIGRATION_KEY='kairos.website.step-one-transport.migrated.20260715-1';
  try{
    if(!sessionStorage.getItem(MIGRATION_KEY)){
      sessionStorage.removeItem(STATE_KEY);
      sessionStorage.setItem(MIGRATION_KEY,'true');
    }
  }catch{}

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    try{
      const requestURL=typeof input==='string'?input:input?.url||'';
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      const url=new URL(requestURL,location.href);
      if(method==='POST'&&url.pathname===PLAN_ROUTE&&typeof init?.body==='string'){
        const payload=JSON.parse(init.body);
        const objective=String(payload?.objective||'');
        const fullRetool=/\b(complete|full)\s+(website\s+)?retool\b|\bredesign\b|\brebuild\b|\bchange\s+(the\s+)?(style|styling|layout|colors?|cards?|pills?|theme)\b/i.test(objective);
        payload.requestType=fullRetool?'full-retool':'content-only';
        payload.intent=payload.requestType;
        const headers=new Headers(init.headers||{});
        headers.set('Content-Type','application/json');
        headers.set('X-Kairos-Website-Intent',payload.requestType);
        headers.set('X-Kairos-Step-One-Transport',BUILD);
        init={...init,headers,body:JSON.stringify(payload)};
      }
    }catch(error){
      console.error(BUILD,error);
    }
    return nativeFetch(input,init);
  };
})();
