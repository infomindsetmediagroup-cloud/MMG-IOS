const BUILD="kairos-executive-simple-mode-20260714-6";
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
const PRIORITY_WEIGHT={critical:4,high:3,normal:2,low:1};
let working=false;
let myWorkOpen=false;
let cachedWorkflows=[];

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
    cachedWorkflows=workflows;
    const open=workflows.filter(item=>!["completed","cancelled"].includes(item.state));
    const actions=buildActionQueue(open);
    const pulse=buildExecutivePulse(workflows);
    const healthy=healthResult.response.ok&&["ready","ok"].includes(String(healthResult.body?.status||"").toLowerCase());
    if(actions.length){
      panel.innerHTML=actionCard(actions[0],actions.length-1,pulse);
    }else if(!healthy){
      panel.innerHTML=`${copyBlock("Kairos needs attention","Open Operations for the guided fix.",pulse)}<button type="button" class="system-care-action" data-open-operations>Open Operations</button><span class="system-care-status" data-state="attention">Needs attention</span>`;
    }else{
      panel.innerHTML=`${copyBlock("Kairos is ready","No action is required.",pulse)}${pulse.total?`<button type="button" class="system-care-secondary" data-open-my-work>Open My Work</button>`:""}<span class="system-care-status" data-state="healthy">Ready</span>`;
    }
    if(myWorkOpen)renderMyWork();
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

function renderMyWork(){
  const care=document.querySelector("#kairos-system-care");
  if(!care)return;
  let root=document.querySelector("#kairos-my-work");
  if(!myWorkOpen){root?.remove();return;}
  if(!root){
    root=document.createElement("section");
    root.id="kairos-my-work";
    root.className="kairos-my-work";
    care.insertAdjacentElement("afterend",root);
  }
  const cutoff=Date.now()-24*60*60*1000;
  const active=cachedWorkflows.filter(item=>item.state==="active");
  const waiting=cachedWorkflows.filter(item=>!["active","completed","cancelled"].includes(item.state));
  const done=cachedWorkflows.filter(item=>item.state==="completed"&&Date.parse(item.updatedAt||item.completedAt||0)>=cutoff);
  const focus=selectNextBestAction(cachedWorkflows);
  root.innerHTML=`<header class="my-work-head"><div><span class="system-care-kicker">My Work</span><h2>What Kairos is handling</h2><p>Only the work that needs your attention or is moving now.</p></div><button type="button" class="my-work-close" data-close-my-work>Close</button></header>${focus?focusMarkup(focus):`<section class="my-work-focus is-clear"><div><span class="system-care-kicker">Today’s Focus</span><strong>You are caught up</strong><small>Kairos has no next action waiting for you.</small></div><span class="my-work-focus-state">Clear</span></section>`}<div class="my-work-groups">${workGroup("In Progress",active,"Nothing is running right now.")}${workGroup("Waiting",waiting,"Nothing is waiting on you.")}${workGroup("Finished Today",done,"Nothing has finished today yet.")}</div>`;
  setTimeout(()=>root.scrollIntoView({behavior:"smooth",block:"start"}),20);
}

function selectNextBestAction(workflows){
  const candidates=workflows.filter(item=>!["completed","cancelled"].includes(item.state)).map(item=>{
    const approval=item.approvalRequired&&String(item.approvalStatus||"pending")==="pending";
    const blocked=item.state==="blocked";
    const finish=Number(item.progress||0)===100;
    const active=item.state==="active";
    const score=(approval?500:blocked?400:finish?350:active?300:200)+(PRIORITY_WEIGHT[item.priority]||2)*10+Number(item.progress||0)/100;
    return {item,score,action:workAction(item)};
  }).filter(entry=>entry.action).sort((a,b)=>b.score-a.score||Date.parse(b.item.updatedAt||0)-Date.parse(a.item.updatedAt||0));
  return candidates[0]||null;
}

function focusMarkup(focus){
  const item=focus.item;
  const action=focus.action;
  const progress=Math.max(0,Math.min(100,Number(item.progress||0)));
  return `<section class="my-work-focus"><div class="my-work-focus-copy"><span class="system-care-kicker">Today’s Focus</span><strong>${escapeHTML(item.title||"Next best action")}</strong><small>${escapeHTML(plainObjective(item))}</small><div class="my-work-focus-meter"><span style="width:${progress}%"></span></div></div><div class="my-work-focus-action"><b>${progress}%</b><button type="button" data-executive-command="${escapeHTML(action.command)}" data-workflow-id="${escapeHTML(item.id)}">${escapeHTML(action.label)}</button></div></section>`;
}

function workGroup(title,items,empty){
  return `<section class="my-work-group"><header><h3>${escapeHTML(title)}</h3><span>${items.length}</span></header>${items.length?`<div class="my-work-list">${items.slice(0,6).map(workRow).join("")}</div>`:`<p class="my-work-empty">${escapeHTML(empty)}</p>`}</section>`;
}

function workRow(item){
  const action=workAction(item);
  const progress=Math.max(0,Math.min(100,Number(item.progress||0)));
  return `<article class="my-work-row"><div class="my-work-copy"><strong>${escapeHTML(item.title||"Kairos work")}</strong><small>${escapeHTML(plainObjective(item))}</small><div class="my-work-meter"><span style="width:${progress}%"></span></div></div><div class="my-work-meta"><b>${progress}%</b>${action?`<button type="button" data-executive-command="${escapeHTML(action.command)}" data-workflow-id="${escapeHTML(item.id)}">${escapeHTML(action.label)}</button>`:"<span>Done</span>"}</div></article>`;
}

function workAction(item){
  if(item.approvalRequired&&String(item.approvalStatus||"pending")==="pending")return{label:"Approve & Start",command:"approve-start"};
  if(item.state==="blocked")return{label:"Resume",command:"resume"};
  if(Number(item.progress||0)===100&&item.state!=="completed")return{label:"Finish",command:"complete"};
  if(item.state==="active")return{label:"Continue",command:"open"};
  if(item.state==="completed")return null;
  return{label:"Open",command:"open"};
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
    myWorkOpen=true;renderMyWork();
    return;
  }
  const closeMyWork=event.target.closest?.("[data-close-my-work]");
  if(closeMyWork){
    event.preventDefault();event.stopImmediatePropagation();
    myWorkOpen=false;renderMyWork();
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
window.KairosExecutiveSimpleMode={build:BUILD,refresh:renderSystemCare,openMyWork:()=>{myWorkOpen=true;renderMyWork();}};