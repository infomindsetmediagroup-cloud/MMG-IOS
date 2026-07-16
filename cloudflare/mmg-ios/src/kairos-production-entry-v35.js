import runtime,{KairosProject} from './kairos-production-entry-v34.js';
import contentOnlyPlanner from './kairos-content-only-shopify-planner-v2.js';
import liquidContentExecutor from './kairos-liquid-content-only-executor-v1.js';
import{handleOperationalRequest,mirrorOperationalResponse,KAIROS_OPERATIONAL_RUNTIME_BUILD}from'./kairos-operational-runtime-v1.js';
import{intelligenceConfigured}from'./kairos-intelligence-v1.js';

const BUILD='kairos-production-entry-20260715-89';
const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
const EXECUTE_ROUTE='/api/shopify/staging/execute/jobs';
const CONTENT_ONLY_DECLARATIONS=new Set(['content-only','copy-only','text-only','literal-replacement']);
const FULL_RETOOL_DECLARATIONS=new Set(['full-retool','structural','structural-retool','design-retool','website-build','site-build','homepage-build','page-build']);
const STRUCTURAL_PATTERNS=[
  /\b(full|complete|comprehensive|canonical)\s+(website|site|homepage|page|storefront)\s+(retool|redesign|rebuild|build|overhaul|implementation)\b/i,
  /\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure)\b[\s\S]{0,80}\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system)\b/i,
  /\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system)\b[\s\S]{0,80}\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure)\b/i,
  /\bapple[- ]style\b/i,
  /\b(structural|layout|visual|styling|responsive|mobile|desktop|animation|motion|component|template|theme)\s+(change|changes|work|update|updates|implementation|retool|redesign)\b/i,
  /\b(add|remove|move|reorder|create|replace)\b[\s\S]{0,60}\b(section|sections|component|components|navigation|header|footer|layout|template|card|cards|carousel|hero)\b/i
];

export{KairosProject};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    try{
      const operational=await handleOperationalRequest(request,env,ctx,next=>runtime.fetch(next,env,ctx));
      if(operational)return stamp(operational,{intent:'operational-runtime',reason:'durable-domain-orchestration'});
    }catch(error){
      return jsonError(Number(error?.statusCode||500),error?.code||'operational_runtime_failed',error instanceof Error?error.message:'Kairos operational runtime failed.');
    }
    if(request.method==='POST'&&url.pathname===PLAN_ROUTE){
      const classification=await classifyWebsiteIntent(request.clone());
      const response=classification.intent==='full-retool'
        ?await runtime.fetch(withIntentHeaders(request,classification),env,ctx)
        :await contentOnlyPlanner.fetch(withIntentHeaders(request,classification),env,ctx);
      preserveOperationalResponse(request,response,env,ctx);
      return stamp(response,classification);
    }
    if(request.method==='POST'&&url.pathname===EXECUTE_ROUTE){
      let payload={};
      try{payload=await request.clone().json();}catch{}
      if(isContentOnlyExecution(payload)){
        const response=await executeFreshContentOnlyPlan(request,payload,env,ctx);
        preserveOperationalResponse(request,response,env,ctx);
        return stamp(response,{intent:'content-only',reason:'approved-content-only-plan'});
      }
      const response=await runtime.fetch(request,env,ctx);
      preserveOperationalResponse(request,response,env,ctx);
      return stamp(response,{intent:'full-retool',reason:'approved-structural-plan'});
    }
    let response=await runtime.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/api/health'||url.pathname==='/api/capabilities'))response=await operationalHealth(response,env);
    preserveOperationalResponse(request,response,env,ctx);
    return stamp(response,{intent:'passthrough',reason:'non-website-plan-route'});
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

function preserveOperationalResponse(request,response,env,ctx){
  const work=mirrorOperationalResponse(request,response,env).catch(()=>{});
  if(typeof ctx?.waitUntil==='function')ctx.waitUntil(work);
}

async function operationalHealth(response,env){
  let body={};
  try{body=await response.clone().json();}catch{return response;}
  body.operationalRuntime={
    build:KAIROS_OPERATIONAL_RUNTIME_BUILD,
    orchestration:'domain-routed',
    persistence:env?.KAIROS_PROJECTS?'durable-object':'needs-configuration',
    privateIntelligence:intelligenceConfigured(env)?'configured':'needs-configuration',
    deterministicNativeFallback:'operational'
  };
  body.capabilities={
    ...(body.capabilities||{}),
    childCardActionContracts:'durable-domain-routed',
    deterministicChildDeliverables:'retired',
    durableOperationalLedger:env?.KAIROS_PROJECTS?'operational':'needs-configuration',
    lazyDomainWorkspaces:'operational',
    executionReceiptMirroring:'operational'
  };
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Kairos-Operational-Runtime',KAIROS_OPERATIONAL_RUNTIME_BUILD);
  return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers});
}

function isContentOnlyExecution(payload){
  const requestType=String(payload?.plan?.requestType||payload?.plan?.plan?.requestType||'').toLowerCase();
  const mode=String(payload?.plan?.plan?.installationMode||'');
  return CONTENT_ONLY_DECLARATIONS.has(requestType)||mode==='existing-liquid-visible-text'||mode==='inspection-only';
}

async function classifyWebsiteIntent(request){
  let payload={};try{payload=await request.json();}catch{}
  const declared=String(payload?.requestType||payload?.intent||payload?.mode||'').trim().toLowerCase();
  const objective=String(payload?.objective||payload?.prompt||payload?.instruction||'').trim();
  const contentOnlyLocked=payload?.contentOnlyLocked===true||payload?.literalOnly===true||request.headers.get('X-Kairos-Content-Only-Lock')==='true';
  const explicitFull=FULL_RETOOL_DECLARATIONS.has(declared)||payload?.fullRetoolConfirmed===true||payload?.structuralMutationAuthorized===true||payload?.styleMutationAuthorized===true;
  const inferredFull=STRUCTURAL_PATTERNS.some(pattern=>pattern.test(objective));

  if(contentOnlyLocked||CONTENT_ONLY_DECLARATIONS.has(declared))return{intent:'content-only',reason:contentOnlyLocked?'explicit-content-only-lock':'explicit-content-only-declaration',declared,objective};
  if(explicitFull)return{intent:'full-retool',reason:'explicit-structural-authorization',declared,objective};
  if(inferredFull)return{intent:'full-retool',reason:'structural-objective-detected',declared,objective};
  return{intent:'content-only',reason:'no-structural-operation-detected',declared,objective};
}

function withIntentHeaders(request,classification){
  const headers=new Headers(request.headers);
  headers.set('X-Kairos-Website-Intent',classification.intent);
  headers.set('X-Kairos-Intent-Reason',classification.reason);
  headers.set('X-Kairos-Content-Only-Lock',classification.intent==='content-only'?'true':'false');
  return new Request(request,{headers});
}

function stamp(response,classification){
  const intent=classification?.intent||'passthrough';
  const reason=classification?.reason||'unspecified';
  const headers=new Headers(response.headers);
  headers.set('X-Kairos-Production-Entry',BUILD);
  headers.set('X-Kairos-Website-Intent',intent);
  headers.set('X-Kairos-Intent-Reason',reason);
  headers.set('X-Kairos-Content-Only-Lock',intent==='content-only'?'true':'false');
  headers.set('X-Kairos-Structural-Runtime',intent==='full-retool'?'enabled':'not-selected');
  headers.set('X-Kairos-Liquid-Content-Only',intent==='content-only'?'enabled':'not-selected');
  headers.set('X-Kairos-Server-Plan-Refresh','enabled');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function jsonError(status,code,message){return new Response(JSON.stringify({status:'needs-attention',build:BUILD,summary:message,error:{status,code,message}}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Kairos-Production-Entry':BUILD,'X-Kairos-Website-Intent':'content-only','X-Kairos-Content-Only-Lock':'true','X-Kairos-Server-Plan-Refresh':'enabled','X-Content-Type-Options':'nosniff'}});}
