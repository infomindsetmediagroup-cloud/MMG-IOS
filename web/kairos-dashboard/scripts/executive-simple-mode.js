const BUILD="kairos-executive-simple-mode-20260714-4";
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
  panel.innerHTML=checkingCard();
  try{
    const [healthResult,workflowResult]=await Promise.all([request("/api/health"),request("/api/workflows")]);
    const workflows=workflowResult.body?.workflows||[];
    const open=workflows.filter(item=>!["completed","cancelled"].includes(item.state));
    const actions=buildActionQueue(open);
    const pulse=buildExecutivePulse(workflows);
    const healthy=healthResult.response.ok&&["ready","ok"].includes(String(healthResult.body?.status||"").toLowerCase());
    if(actions.length){
      const current=actions[0];
      panel.innerHTML=actionCard(current,actions.length-1,pulse);
    }else if(!healthy){
      panel.innerHTML=`${copyBlock("Kairos needs attention","Open Operations for the guided fix.",pulse)}<button type="button" class="system-care-action" data-open-operations>Open Operations</button><span class="system-care-status" data-state="attention">Needs attention</span>`;
    }else{
      panel.innerHTML=`${copyBlock("Kairos is ready","No action is required.",pulse)}${pulse.total?`<button type="button" class="system-care-secondary" data-open-my-work>Open My Work</button>`:""}<span class="system-care-status" data-state="healthy">Ready</span>`;
    }
  }catch{
    panel.innerHTML=checkingCard();
  }
  hideTechnicalPanels();
}

function buildActionQueue(open){
  const actions=[];
  for(const item of open){
    const approval=item.approvalRequired&&String(item.approvalStatus||"pending")==="pending";
    const remediation=["command-center-operational-remediation","command-center-recovery-verification"].includes(item.source);
    if(approval)actions.push({rank:1,title:"Approval needed",description:plainObjective(item),label:"Approve & Start",id:item.id,command:"approve-start",state:"approval"});
    else if(remediation)actions.push({rank:2,title:"Kairos needs attention",description:"A guided fix is prepared and ready to continue.",label:"Continue Fix",id:item.id,command:"open",state:"attention"});
    else if(item.state==="blocked")actions.push({rank:3,title:"Kairos needs attention",description:plainObjective(item),label:"Resume",id:item.id,command:"resume",state:"attention"});
    else if(Number(item.progress||0)===100&&item.state!=="completed")actions.push({rank:4,title:"Work ready to finish",description:plainObjective(item),label:"Finish",id:item.id,command:"complete",state:"approval"});
  }
  return actions.sort((a,b)=>a.rank-b.rank);
}

function buildExecutivePulse(workflows){
  const cutoff=Date.now()-24*60*60*1000;
  const inProgress=workflows.filter(item=>item.state==="active").length;
  const finished=workflows.filter(item=>item.state==="completed"&&Date.parse(item.updatedAt||item.completedAt||0)>=cutoff).length;
  const waiting=workflows.filter(item=>!["active","completed","cancelled"].includes(item.state)).length;
  const parts=[];
  if(inProgress)parts.push(`${inProgress} in progress`);
  if(waiting)parts.push(`${waiting} waiting`);
  if(finished)parts.push(`${finished} finished today`);
  return {text:parts.length?parts.join(" · "):"No open work",total:inProgress+waiting+finished};
}

function actionCard(action,remaining,pulse){
  const queued=remaining>0?`<span class="system-care-queued">${remaining} more waiting</span>`:"";
  return `${copyBlock(action.title,action.description,pulse)}<div class="system-care-actions"><button type="button" class="system-care-action" data-executive-command="${escapeHTML(action.command)}" data-workflow-id="${escapeHTML(action.id)}">${escapeHTML(action.label)}</button>${queued}</div><span class="system-care-status" data-state="${escapeHTML(action.state)}">${action.state==="approval"?"Your approval":"Needs attention"}</span>`;
}

function copyBlock(title,description,pulse){
  return `<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small><span class="system-care-pulse">${escapeHTML(pulse.text)}</span></div>`;
}

function checkingCard(){
  return `<div class="system-care-copy"><span class="system-care-kicker">System Care</span><strong>Kairos is checking itself</strong><small>You only need to act when Kairos asks.</small></div><span class="system-care-status" data-state="checking">Checking</span>`;
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
  const myWork=event.target.closest?.("[data-open-my-work]");
  if(myWork){
    event.preventDefault();event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open",{detail:{filter:"active"}}));
    setTimeout(()=>document.querySelector("#workflow-runtime")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
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
  button.textContent=command==="approve-start"?"Approving…":command==="complete"?"Finishing…":"Resuming…";
  try{
    if(command==="approve-start"){
      await workflowCommand(workflowID,"approve");
      const opened=await request(`/api/workflows/${encodeURIComponent(workflowID)}`);
      const workflow=opened.body?.workflow;
      if(opened.response.ok&&workflow?.state==="ready"&&workflow?.approvalStatus==="approved")await workflowCommand(workflowID,"start");
    }else if(command==="resume"){
      await workflowCommand(workflowID,"resume");
    }else if(command==="complete"){
      await workflowCommand(workflowID,"complete");
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