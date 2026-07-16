import runtime,{KairosProject} from './kairos-production-entry-v34.js';
import contentOnlyPlanner from './kairos-content-only-shopify-planner-v1.js';
import liquidContentExecutor from './kairos-liquid-content-only-executor-v1.js';

const BUILD='kairos-production-entry-20260715-83';
const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
const EXECUTE_ROUTE='/api/shopify/staging/execute/jobs';

export{KairosProject};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname===PLAN_ROUTE){
      const intent=await classifyWebsiteIntent(request.clone());
      const response=intent==='full-retool'?await runtime.fetch(request,env,ctx):await contentOnlyPlanner.fetch(request,env,ctx);
      return stamp(response,intent);
    }
    if(request.method==='POST'&&url.pathname===EXECUTE_ROUTE){
      let payload={};
      try{payload=await request.clone().json();}catch{}
      const mode=String(payload?.plan?.plan?.installationMode||'');
      if(mode==='existing-liquid-visible-text')return stamp(await liquidContentExecutor.fetch(request,env,ctx),'content-only');
    }
    return stamp(await runtime.fetch(request,env,ctx),'passthrough');
  },
  async scheduled(controller,env,ctx){if(typeof runtime.scheduled==='function')return runtime.scheduled(controller,env,ctx);}
};

async function classifyWebsiteIntent(request){
  let payload={};try{payload=await request.json();}catch{}
  const declared=String(payload?.requestType||payload?.intent||'').toLowerCase();
  const confirmed=payload?.fullRetoolConfirmed===true;
  if(declared==='full-retool'&&confirmed)return'full-retool';
  return'content-only';
}
function stamp(response,intent){const headers=new Headers(response.headers);headers.set('X-Kairos-Production-Entry',BUILD);headers.set('X-Kairos-Website-Intent',intent);headers.set('X-Kairos-Content-Only-Lock',intent==='content-only'?'true':'false');headers.set('X-Kairos-Liquid-Content-Only','enabled');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
