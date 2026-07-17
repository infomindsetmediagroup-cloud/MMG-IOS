import runtime,{KairosProject}from'./kairos-production-entry-v30.js';
import canonicalPlanner from'./kairos-canonical-shopify-planner-v2.js';

const BUILD='kairos-production-entry-20260715-78';
const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
const PLAN_JOB_ROUTE=/^\/api\/shopify\/staging\/plan\/jobs\/[a-f0-9-]+$/i;

export{KairosProject};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if((request.method==='POST'&&url.pathname===PLAN_ROUTE)||(request.method==='GET'&&PLAN_JOB_ROUTE.test(url.pathname))){
      const response=await canonicalPlanner.fetch(request,env,ctx);
      return stamp(response);
    }
    return stamp(await runtime.fetch(request,env,ctx));
  },
  async scheduled(controller,env,ctx){
    if(typeof runtime.scheduled==='function')return runtime.scheduled(controller,env,ctx);
  }
};

function stamp(response){
  const headers=new Headers(response.headers);
  headers.set('X-Kairos-Production-Entry',BUILD);
  headers.set('X-Kairos-Canonical-Plan-Route','top-level');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
