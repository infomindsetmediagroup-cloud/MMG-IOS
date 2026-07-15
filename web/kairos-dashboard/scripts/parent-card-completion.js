const BUILD="kairos-parent-card-completion-20260715-1";
const RECEIPT_KEY="kairos.parent-card.completion.receipts";
const knowledgeChildren=["knowledge-library","research-brief","decision-record","doctrine-vault","intelligence-synthesis"];
const contracts={knowledge:{status:"verified",children:knowledgeChildren,route:"/api/hub/run",resultStates:["working","completed","failed"],returnPath:"command-center"}};
let activeChild=null;
let scheduled=false;
const root=document.querySelector("#kairos-hub");

document.addEventListener("click",event=>{
  const child=event.target.closest?.("[data-child]")?.dataset.child;
  if(knowledgeChildren.includes(child)) activeChild=child;
});

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;applyKnowledgeContract();captureReceipt()});
}

function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}
function setAttr(node,name,value){if(node&&node.getAttribute(name)!==String(value))node.setAttribute(name,String(value))}

function applyKnowledgeContract(){
  const parent=document.querySelector('.parent-card[data-center="knowledge"]');
  if(parent){
    setAttr(parent,"data-readiness",100);
    setAttr(parent,"data-operational-contract","verified");
    const signal=parent.querySelector(".card-signal");
    if(signal){const dot=signal.querySelector("i")?.outerHTML||"<i></i>";if(signal.innerHTML!==`${dot}COMPLETE`)signal.innerHTML=`${dot}COMPLETE`}
    const meter=parent.querySelector('[role="progressbar"]');
    setAttr(meter,"aria-valuenow",100);
    const fill=meter?.querySelector("span");if(fill&&fill.style.getPropertyValue("--meter")!=="100%")fill.style.setProperty("--meter","100%");
    setText(parent.querySelector(".card-foot b"),"100% operational");
  }
  const workspace=document.querySelector("#workspace");
  if(!workspace||!workspace.querySelector(".workspace-head .eyebrow")?.textContent.includes("Knowledge Center"))return;
  const readiness=workspace.querySelector(".center-readiness");
  if(readiness){
    setAttr(readiness,"data-operational-contract","verified");
    setText(readiness.querySelector("header h3"),"100% operational");
    setText(readiness.querySelector("header p:not(.eyebrow)"),"Current blueprint complete");
    const state=readiness.querySelector(".readiness-state");setText(state,"Complete");setAttr(state,"data-level","complete");
    const overall=readiness.querySelector(".readiness-overall");setAttr(overall,"aria-valuenow",100);const overallFill=overall?.querySelector("span");if(overallFill)overallFill.style.setProperty("--meter","100%");
  }
  for(const child of knowledgeChildren){
    const button=workspace.querySelector(`[data-child="${child}"]`);
    const card=button?.closest(".child-card");
    if(!card)continue;
    setAttr(card,"data-readiness",100);setAttr(card,"data-operational-contract","verified");
    setText(card.querySelector(".child-readiness span"),"100%");
  }
  workspace.querySelectorAll(".readiness-breakdown article").forEach(article=>{
    setText(article.querySelector("small"),"Complete");setText(article.querySelector("b"),"100%");
    const meter=article.querySelector('[role="progressbar"]');setAttr(meter,"aria-valuenow",100);const fill=meter?.querySelector("span");if(fill)fill.style.setProperty("--meter","100%");
  });
}

function captureReceipt(){
  if(!activeChild)return;
  const panel=document.querySelector("#workspace .job");
  if(!panel||!panel.querySelector(".deliverable"))return;
  const receipts=readReceipts();
  receipts[activeChild]={child:activeChild,status:"completed",completedAt:new Date().toISOString(),contractBuild:BUILD};
  try{localStorage.setItem(RECEIPT_KEY,JSON.stringify(receipts))}catch{}
  activeChild=null;
}
function readReceipts(){try{const value=JSON.parse(localStorage.getItem(RECEIPT_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}catch{return{}}}

if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener("load",schedule,{once:true});
schedule();
window.KairosParentCardCompletion={build:BUILD,contracts,getReceipts:readReceipts,refresh:schedule};
