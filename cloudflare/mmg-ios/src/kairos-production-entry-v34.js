import runtime,{KairosProject} from './kairos-production-entry-v33.js';
import contentOnlyPlanner from './kairos-content-only-shopify-planner-v1.js';

const BUILD='kairos-production-entry-20260715-81';
const PLAN_ROUTE='/api/shopify/staging/plan/jobs';

export{KairosProject};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname===PLAN_ROUTE){
      const intent=await classifyWebsiteIntent(request.clone());
      const response=intent==='full-retool'
        ? await runtime.fetch(request,env,ctx)
        : await contentOnlyPlanner.fetch(request,env,ctx);
      return stamp(response,intent);
    }
    return stamp(await runtime.fetch(request,env,ctx),'passthrough');
  },
  async scheduled(controller,env,ctx){
    if(typeof runtime.scheduled==='function')return runtime.scheduled(controller,env,ctx);
  }
};

async function classifyWebsiteIntent(request){
  let payload={};
  try{payload=await request.json();}catch{}
  const objective=String(payload?.objective||'').toLowerCase();
  const declared=String(payload?.requestType||payload?.intent||'').toLowerCase();

  if(['full-retool','redesign','rebuild'].includes(declared))return'full-retool';
  if(['content-only','copy-only','text-only'].includes(declared))return'content-only';

  const preserveSignals=[
    /content[- ]only/,/text[- ]only/,/copy[- ]only/,/wording only/,
    /swap (out )?(the )?(content|text|copy|words)/,
    /replace (the )?(content|text|copy|words)/,
    /keep (the )?(style|styling|design|layout|colors?|cards?|pills?)/,
    /(style|styling|design|layout|colors?|cards?|pills?).{0,40}(stay|remain|unchanged|same|preserve)/,
    /do not (change|touch|alter).{0,50}(style|styling|design|layout|colors?|cards?|pills?)/
  ];
  if(preserveSignals.some(pattern=>pattern.test(objective)))return'content-only';

  const fullRetoolSignals=[
    /complete (website )?retool/,/full (website )?retool/,/redesign (the )?(entire )?(website|homepage)/,
    /rebuild (the )?(entire )?(website|homepage)/,/new (visual )?(design|layout|theme)/,
    /change (the )?(style|styling|design|layout|colors?|cards?|pills?)/,
    /replace (the )?(theme|layout|visual system)/
  ];
  if(fullRetoolSignals.some(pattern=>pattern.test(objective)))return'full-retool';

  return'content-only';
}

function stamp(response,intent){
  const headers=new Headers(response.headers);
  headers.set('X-Kairos-Production-Entry',BUILD);
  headers.set('X-Kairos-Website-Intent',intent);
  headers.set('X-Kairos-Content-Only-Default','true');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
