(function(){
  const BUILD='kairos-website-step-one-transport-20260715-3';
  const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
  const STATE_KEY='kairos.website.operational-flow.v2';
  const MIGRATION_KEY='kairos.website.step-one-transport.migrated.20260715-3';
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
        const confirmedFullRetool=payload?.requestType==='full-retool'&&payload?.fullRetoolConfirmed===true;
        payload.requestType=confirmedFullRetool?'full-retool':'content-only';
        payload.intent=payload.requestType;
        payload.contentOnlyLocked=!confirmedFullRetool;
        const headers=new Headers(init.headers||{});
        headers.set('Content-Type','application/json');
        headers.set('X-Kairos-Website-Intent',payload.requestType);
        headers.set('X-Kairos-Content-Only-Lock',confirmedFullRetool?'false':'true');
        headers.set('X-Kairos-Step-One-Transport',BUILD);
        init={...init,headers,body:JSON.stringify(payload)};
      }
    }catch(error){
      console.error(BUILD,error);
    }
    return nativeFetch(input,init);
  };
})();
