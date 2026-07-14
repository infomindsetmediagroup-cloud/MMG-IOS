const BUILD="kairos-executive-simple-mode-20260714-1";
const TECHNICAL_SELECTORS=[
  ".readiness-system-certification",
  ".readiness-operational-assurance",
  ".readiness-operational-remediation",
  ".readiness-recovery-verification",
  ".readiness-assurance-renewal",
  ".readiness-certification-applicability",
  ".readiness-recertification",
  ".readiness-certificate-succession"
];

start();

function start(){
  document.documentElement.classList.add("kairos-executive-simple");
  document.addEventListener("click",handleClick,true);
  [700,1700,3200,5200].forEach(delay=>setTimeout(renderSystemCare,delay));
  window.addEventListener("kairos:readiness-registry:updated",()=>setTimeout(renderSystemCare,250),{passive:true});
}

async function renderSystemCare(){
  hideTechnicalPanels();
  const hub=document.querySelector("#kairos-hub");
  if(!hub)return;
  let panel=document.querySelector("#kairos-system-care");
  if(!panel){
    panel=document.createElement("section");
    panel.id="kairos-system-care";
    panel.className="kairos-system-care";
    hub.insertAdjacentElement("afterend",panel);
  }
  panel.innerHTML=`<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>Kairos is checking itself</strong><small>You only need to act when Kairos asks.</small></div><span class="system-care-status" data-state="checking">Checking</span>`;
  try{
    const [healthResult,workflowResult]=await Promise.all([request("/api/health"),request("/api/workflows")]);
    const workflows=workflowResult.body?.workflows||[];
    const open=workflows.filter(item=>!["completed","cancelled"].includes(item.state));
    const approval=open.find(item=>item.approvalRequired&&String(item.approvalStatus||"pending")==="pending");
    const blocked=open.find(item=>item.state==="blocked");
    const remediation=open.find(item=>["command-center-operational-remediation","command-center-recovery-verification"].includes(item.source));
    const healthy=healthResult.response.ok&&["ready","ok"].includes(String(healthResult.body?.status||"").toLowerCase());
    if(approval){
      panel.innerHTML=card("Approval needed","Kairos has one item ready for your decision.","Review & Approve",approval.id,"approval");
    }else if(remediation){
      panel.innerHTML=card("Kairos needs attention","A guided fix is already prepared.","Fix It",remediation.id,"attention");
    }else if(blocked){
      panel.innerHTML=card("Kairos needs attention","One item is blocked. Open it and Kairos will guide the next step.","Resolve Issue",blocked.id,"attention");
    }else if(!healthy){
      panel.innerHTML=`<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>Kairos needs attention</strong><small>Open Operations for the guided fix.</small></div><button type="button" class="system-care-action" data-open-operations>Open Operations</button><span class="system-care-status" data-state="attention">Needs attention</span>`;
    }else{
      panel.innerHTML=`<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>Kairos is ready</strong><small>No action is required.</small></div><span class="system-care-status" data-state="healthy">Ready</span>`;
    }
  }catch{
    panel.innerHTML=`<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>Kairos is checking itself</strong><small>No action is required unless a guided fix appears.</small></div><span class="system-care-status" data-state="checking">Checking</span>`;
  }
  hideTechnicalPanels();
}

function card(title,description,label,id,state){
  return `<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></div><button type="button" class="system-care-action" data-open-system-workflow="${escapeHTML(id)}">${escapeHTML(label)}</button><span class="system-care-status" data-state="${escapeHTML(state)}">${state==="approval"?"Your approval":"Needs attention"}</span>`;
}

function hideTechnicalPanels(){
  document.querySelectorAll(TECHNICAL_SELECTORS.join(",")).forEach(node=>{node.hidden=true;node.setAttribute("aria-hidden","true");});
}

function handleClick(event){
  const workflowButton=event.target.closest?.("[data-open-system-workflow]");
  if(workflowButton){
    event.preventDefault();event.stopImmediatePropagation();
    const workflowID=workflowButton.dataset.openSystemWorkflow;
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open",{detail:{workflowID}}));
    setTimeout(()=>document.querySelector("#workflow-runtime")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
    return;
  }
  const operations=event.target.closest?.("[data-open-operations]");
  if(operations){
    event.preventDefault();event.stopImmediatePropagation();
    document.querySelector('[data-center="operations"]')?.click();
  }
}

async function request(url){const response=await fetch(url,{cache:"no-store",credentials:"include"});const text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={message:text}}return{response,body}}
function escapeHTML(value){return String(value??"").replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character])}
window.KairosExecutiveSimpleMode={build:BUILD,refresh:renderSystemCare};