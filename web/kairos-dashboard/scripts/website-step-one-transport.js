(function(){
  const BUILD='kairos-website-transport-20260715-5';
  const PLAN_ROUTE='/api/shopify/staging/plan/jobs';
  const STATE_KEY='kairos.website.operational-flow.v2';
  const MIGRATION_KEY='kairos.prompt-boxes.fresh.20260715-1';
  const PROMPT_SELECTOR='textarea.objective,textarea[id*="objective"],textarea[id*="prompt"],input[type="text"][id*="objective"],input[type="text"][id*="prompt"]';

  function sanitizeWebsiteState(raw){
    try{
      const value=JSON.parse(String(raw||'null'));
      if(!value||typeof value!=='object')return raw;
      value.objective='';
      return JSON.stringify(value);
    }catch{return raw;}
  }

  function clearPromptFields(root=document){
    root.querySelectorAll?.(PROMPT_SELECTOR).forEach(field=>{
      if(field.dataset.kairosUserEditing==='true')return;
      field.value='';
      field.defaultValue='';
      field.removeAttribute('value');
      field.dataset.kairosFreshPrompt='true';
    });
  }

  try{
    const existing=sessionStorage.getItem(STATE_KEY);
    if(existing)sessionStorage.setItem(STATE_KEY,sanitizeWebsiteState(existing));
    sessionStorage.setItem(MIGRATION_KEY,'true');

    const nativeSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(this===sessionStorage&&key===STATE_KEY)value=sanitizeWebsiteState(value);
      return nativeSetItem.call(this,key,value);
    };
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
    }catch(error){console.error(BUILD,error);}
    return nativeFetch(input,init);
  };

  document.addEventListener('focusin',event=>{
    const field=event.target.closest?.(PROMPT_SELECTOR);
    if(!field)return;
    if(field.dataset.kairosFreshPrompt!=='true'){
      field.value='';
      field.defaultValue='';
      field.dataset.kairosFreshPrompt='true';
    }
    field.dataset.kairosUserEditing='true';
  },true);
  document.addEventListener('focusout',event=>{
    const field=event.target.closest?.(PROMPT_SELECTOR);
    if(field)delete field.dataset.kairosUserEditing;
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-run-directive],[data-website-plan],[data-reset-workspace],[data-website-new],[data-website-revise],[data-route-workspace],[data-route-center],[data-route-home]')){
      setTimeout(()=>clearPromptFields(),0);
    }
  });
  window.addEventListener('pageshow',()=>clearPromptFields());
  document.addEventListener('DOMContentLoaded',()=>clearPromptFields(),{once:true});
  queueMicrotask(()=>clearPromptFields());
  window.KairosFreshPromptPolicy={build:BUILD,clear:clearPromptFields,stateKey:STATE_KEY};
})();