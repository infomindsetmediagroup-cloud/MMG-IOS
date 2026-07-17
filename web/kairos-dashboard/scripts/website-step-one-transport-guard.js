const WEBSITE_STATE_KEY="kairos.website.operational-flow.v2";
const RESET_MARKER="kairos.website.step-one.transport-reset.20260715-1";

try{
  if(!sessionStorage.getItem(RESET_MARKER)){
    sessionStorage.removeItem(WEBSITE_STATE_KEY);
    sessionStorage.setItem(RESET_MARKER,"done");
  }
}catch{}

const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
  try{
    const url=typeof input==="string"?input:input?.url||"";
    if(url.includes("/api/shopify/staging/plan/jobs")&&String(init?.method||"GET").toUpperCase()==="POST"&&typeof init?.body==="string"){
      const payload=JSON.parse(init.body);
      const objective=String(payload?.objective||"").toLowerCase();
      const explicitFullRetool=/\b(full|complete)\s+(website\s+)?retool\b|\bredesign\b|\brebuild\b|\bchange\s+(the\s+)?(layout|style|styling|theme|colors?|cards?|pills?)\b/.test(objective);
      payload.requestType=explicitFullRetool?"full-retool":"content-only";
      init={...init,body:JSON.stringify(payload),headers:{...(init.headers||{}),"X-Kairos-Step-One-Mode":payload.requestType}};
    }
  }catch{}
  return nativeFetch(input,init);
};
