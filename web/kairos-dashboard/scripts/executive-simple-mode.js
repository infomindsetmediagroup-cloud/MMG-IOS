const BUILD="kairos-executive-simple-mode-20260714-2";
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
let working=false;

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
      panel.innerHTML=actionCard("Approval needed",plainObjective(approval),"Approve & Start",approval.id,"approve-start","approval");
    }else if(remediation){
      panel.innerHTML=actionCard("Kairos needs attention","A guided fix is prepared and ready to continue.","Continue Fix",remediation.id,"open","attention");
    }else if(blocked){
      panel.innerHTML=actionCard("Kairos needs attention",plainObjective(blocked),"Resume",blocked.id,"resume","attention");
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

function actionCard(title,description,label,id,command,state){
  return `<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></div><button type="button" class="system-care-action" data-executive-command="${escapeHTML(command)}" data-workflow-id="${escapeHTML(id)}">${escapeHTML(label)}</button><span class="system-care-status" data-state="${escapeHTML(state)}">${state==="approval"?"Your approval":"Needs attention"}</span>`;
}

function plainObjective(workflow){
  const objective=String(workflow?.objective||"").trim();
  if(objective)return objective.length>150?`${objective.slice(0,147)}…`:objective;
  return workflow?.title||"Kairos has an item ready for your decision.";
}

function hideTechnicalPanels(){
  document.querySelectorAll(TECHNICAL_SELECTORS.join(",")).forEach(node=>{node.hidden=true;node.setAttribute("aria-hidden","true");});
}

async function handleClick(event){
  const action=event.target.closest?.("[data-executive-command]");
  if(action){
    event.preventDefault();event.stopImmediatePropagation();
    await runExecutiveAction(action);
    return;
  }
  const operations=event.target.closest?.("[data-open-operations]");
  if(operations){
    event.preventDefault();event.stopImmediatePropagation();
    document.querySelector('[data-center="operations"]')?.click();
  }
}

async function runExecutiveAction(button){
  if(working||button.disabled)return;
  const workflowID=button.dataset.workflowId;
  const command=button.dataset.executiveCommand;
  if(!workflowID)return;
  if(command==="open")return openWorkflow(workflowID);
  working=true;
  const original=button.textContent;
  button.disabled=true;
  button.textContent=command==="approve-start"?"Approving…":"Resuming…";
  try{
    if(command==="approve-start"){
      await workflowCommand(workflowID,"approve");
      const opened=await request(`/api/workflows/${encodeURIComponent(workflowID)}`);
      const workflow=opened.body?.workflow;
      if(opened.response.ok&&workflow?.state==="ready"&&workflow?.approvalStatus==="approved")await workflowCommand(workflowID,"start");
    }else if(command==="resume"){
      await workflowCommand(workflowID,"resume");
    }
    button.textContent="Done";
    setTimeout(renderSystemCare,350);
  }catch(error){
    button.disabled=false;
    button.textContent=original;
    alert(error.message||"Kairos could not complete that action.");
  }finally{working=false;}
}

async function workflowCommand(workflowID,command){
  const result=await request(`/api/workflows/${encodeURIComponent(workflowID)}`,{method:"PATCH",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},body:JSON.stringify({command,actor:"Executive"})});
  if(!result.response.ok)throw new Error(result.body?.error?.message||"Kairos could not complete that action.");
  return result.body?.workflow;
}

function openWorkflow(workflowID){
  window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open",{detail:{workflowID}}));
  setTimeout(()=>document.querySelector("#workflow-runtime")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
}

async function request(url,init={}){const response=await fetch(url,{cache:"no-store",credentials:"include",...init});const text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={message:text}}return{response,body}}
function escapeHTML(value){return String(value??"").replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character])}
window.KairosExecutiveSimpleMode={build:BUILD,refresh:renderSystemCare};