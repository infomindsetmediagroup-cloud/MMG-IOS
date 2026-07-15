import runtime,{KairosProject}from'./kairos-production-entry-v31.js';

const BUILD='kairos-production-entry-20260715-79';

export{KairosProject};

export default{
  async fetch(request,env,ctx){
    return stamp(await runtime.fetch(request,env,ctx));
  },
  async scheduled(controller,env,ctx){
    if(typeof runtime.scheduled==='function')return runtime.scheduled(controller,env,ctx);
  }
};

function stamp(response){
  const headers=new Headers(response.headers);
  headers.set('X-Kairos-Production-Entry',BUILD);
  headers.set('X-Kairos-Website-Retool-Flow','proposal-preview-approval-live-save');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
