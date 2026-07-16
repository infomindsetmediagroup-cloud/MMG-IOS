import runtime,{KairosProject} from './kairos-production-entry-v34.js';
import contentOnlyPlanner from './kairos-content-only-shopify-planner-v2.js';
import liquidContentExecutor from './kairos-liquid-content-only-executor-v1.js';

const BUILD='kairos-production-entry-20260715-87';
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
      if(isContentOnlyExecution(payload)){
        const response=await executeFreshContentOnlyPlan(request,payload,env,ctx);
        return stamp(response,'content-only');
      }
    }
    return stamp(await runtime.fetch(request,env,ctx),'passthrough');
  },
  async scheduled(controller,env,ctx){if(typeof runtime.scheduled==='function')return runtime.scheduled(controller,env,ctx);}
};

async function executeFreshContentOnlyPlan(request,payload,env,ctx){
  const objective=String(payload?.plan?.objective||payload?.approval?.objective||'').trim();
  if(objective.length<3)return jsonError(409,'content_only_objective_missing','The approved content-only objective is missing. Revise the request before building the preview.');

  const planURL=new URL(PLAN_ROUTE,request.url).toString();
  const planHeaders=new Headers(request.headers);
  planHeaders.set('Content-Type','application/json');
  planHeaders.set('X-Kairos-Website-Intent','content-only');
  planHeaders.set('X-Kairos-Content-Only-Lock','true');
  planHeaders.set('X-Kairos-Server-Refresh',BUILD);
  const planRequest=new Request(planURL,{method:'POST',headers:planHeaders,body:JSON.stringify({objective,requestType:'content-only',intent:'content-only',contentOnlyLocked:true,serverRefresh:true})});
  const planResponse=await contentOnlyPlanner.fetch(planRequest,env,ctx);
  let planBody={};
  try{planBody=await planResponse.clone().json();}catch{}
  if(!planResponse.ok||!planBody?.result?.planID)return jsonError(planResponse.status||409,planBody?.error?.code||'content_only_refresh_failed',planBody?.error?.message||planBody?.summary||'Kairos could not refresh the content-only proposal from the current staging source.');

  const freshPlan=planBody.result;
  const approval={
    status:'approved',
    approvedAt:String(payload?.approval?.approvedAt||new Date().toISOString()),
    build:BUILD,
    planID:freshPlan.planID,
    actionID:freshPlan.actionID,
    targetThemeID:freshPlan?.plan?.targetTheme?.gid||'',
    sourceHashes:freshPlan?.plan?.sourceHashes||{},
    objective,
    refreshedFromPlanID:String(payload?.plan?.planID||''),
    serverRefreshed:true
  };
  const executeHeaders=new Headers(request.headers);
  executeHeaders.set('Content-Type','application/json');
  executeHeaders.set('X-Kairos-Website-Intent','content-only');
  executeHeaders.set('X-Kairos-Content-Only-Lock','true');
  executeHeaders.set('X-Kairos-Server-Refresh',BUILD);
  const executeRequest=new Request(request.url,{method:'POST',headers:executeHeaders,body:JSON.stringify({plan:freshPlan,approval})});
  return liquidContentExecutor.fetch(executeRequest,env,ctx);
}

function isContentOnlyExecution(payload){
  const requestType=String(payload?.plan?.requestType||payload?.plan?.plan?.requestType||'').toLowerCase();
  const mode=String(payload?.plan?.plan?.installationMode||'');
  return requestType==='content-only'||mode==='existing-liquid-visible-text'||mode==='inspection-only';
}

async function classifyWebsiteIntent(request){
  let payload={};try{payload=await request.json();}catch{}
  const declared=String(payload?.requestType||payload?.intent||'').toLowerCase();
  const confirmed=payload?.fullRetoolConfirmed===true;
  if(declared==='full-retool'&&confirmed)return'full-retool';
  return'content-only';
}
function stamp(response,intent){const headers=new Headers(response.headers);headers.set('X-Kairos-Production-Entry',BUILD);headers.set('X-Kairos-Website-Intent',intent);headers.set('X-Kairos-Content-Only-Lock',intent==='content-only'?'true':'false');headers.set('X-Kairos-Liquid-Content-Only','enabled');headers.set('X-Kairos-Server-Plan-Refresh','enabled');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function jsonError(status,code,message){return new Response(JSON.stringify({status:'needs-attention',build:BUILD,summary:message,error:{status,code,message}}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Kairos-Production-Entry':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Only-Lock':'true','X-Kairos-Server-Plan-Refresh':'enabled','X-Content-Type-Options':'nosniff'}});}
