(function(){
  const BUILD='kairos-website-step-one-transport-20260715-4';
  const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
  const EXECUTE_ROUTE='/api/shopify/staging/execute/jobs';
  const STATE_KEY='kairos.website.operational-flow.v2';
  const MIGRATION_KEY='kairos.website.step-one-transport.migrated.20260715-4';
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

      if(method==='POST'&&url.pathname===EXECUTE_ROUTE&&typeof init?.body==='string'){
        const payload=JSON.parse(init.body);
        const planEnvelope=payload?.plan;
        const patch=planEnvelope?.plan?.liquidContentPatch;
        const nodeSafe=patch?.nodeDistributionPreserved===true&&patch?.styledTextNodesPreserved===true;
        if(!nodeSafe){
          const objective=String(planEnvelope?.objective||payload?.approval?.objective||'').trim();
          if(!objective)throw new Error('The approved website objective is missing. Start a new Website job.');
          const planResponse=await nativeFetch(PLAN_ROUTE,{
            method:'POST',
            headers:{'Content-Type':'application/json','X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Only-Lock':'true','X-Kairos-Preview-Package-Refresh':BUILD},
            credentials:'include',
            cache:'no-store',
            body:JSON.stringify({objective,requestType:'content-only',intent:'content-only',contentOnlyLocked:true})
          });
          const planBody=await planResponse.json();
          if(!planResponse.ok||!planBody?.result)throw new Error(planBody?.error?.message||planBody?.summary||'Kairos could not refresh the content-only preview package.');
          const freshPlan=planBody.result;
          const freshPatch=freshPlan?.plan?.liquidContentPatch;
          if(freshPatch?.nodeDistributionPreserved!==true||freshPatch?.styledTextNodesPreserved!==true)throw new Error('Kairos refused to build the preview because the refreshed package did not preserve styled text nodes.');
          payload.plan=freshPlan;
          payload.approval={...payload.approval,status:'approved',approvedAt:new Date().toISOString(),planID:freshPlan.planID,actionID:freshPlan.actionID,targetThemeID:freshPlan?.plan?.targetTheme?.gid||'',sourceHashes:freshPlan?.plan?.sourceHashes||{},objective};
          const headers=new Headers(init.headers||{});
          headers.set('Content-Type','application/json');
          headers.set('X-Kairos-Preview-Package-Refresh',BUILD);
          headers.set('X-Kairos-Content-Only-Lock','true');
          init={...init,headers,body:JSON.stringify(payload)};
        }
      }
    }catch(error){
      console.error(BUILD,error);
      return new Response(JSON.stringify({status:'needs-attention',summary:error?.message||'Kairos could not refresh the preview package.',error:{code:'preview_package_refresh_failed',message:error?.message||'Preview package refresh failed.'}}),{status:409,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Kairos-Step-One-Transport':BUILD}});
    }
    return nativeFetch(input,init);
  };
})();