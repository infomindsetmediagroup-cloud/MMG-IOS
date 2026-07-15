import runtime,{KairosProject}from'./kairos-production-entry-v32.js';
import childCommands from'./kairos-standalone-command-worker-v2.js';

const BUILD='kairos-production-entry-20260715-80';
const CHILD_ROUTE='/api/hub/run';

export{KairosProject};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname===CHILD_ROUTE){
      return stamp(await childCommands.fetch(request,env,ctx));
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
  headers.set('X-Kairos-Child-Card-Contracts','normalized-top-edge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
