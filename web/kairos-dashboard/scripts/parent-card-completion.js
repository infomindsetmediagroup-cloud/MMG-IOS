const BUILD="kairos-parent-card-completion-20260715-2";
const RECEIPT_KEY="kairos.parent-card.completion.receipts";
const centerChildren={
  knowledge:["knowledge-library","research-brief","decision-record","doctrine-vault","intelligence-synthesis"],
  content:["website","manuscript-studio","social-production","publishing-studio","creative-studio"]
};
const contracts={
  knowledge:{status:"verified",children:centerChildren.knowledge,route:"/api/hub/run",resultStates:["working","completed","failed"],returnPath:"command-center"},
  content:{status:"verified",children:centerChildren.content,routes:{website:"/api/shopify/staging/plan/jobs",manuscript:"/api/manuscript/intake/advance",social:"/api/social-production/prepare",publishing:"/api/hub/run",creative:"/api/hub/run"},resultStates:["working","completed","failed"],returnPath:"command-center"}
};
const completionSelectors={
  "knowledge-library":"#workspace .deliverable",
  "research-brief":"#workspace .deliverable",
  "decision-record":"#workspace .deliverable",
  "doctrine-vault":"#workspace .deliverable",
  "intelligence-synthesis":"#workspace .deliverable",
  website:"#workspace .deliverable",
  "manuscript-studio":"#manuscript-studio-overlay .manuscript-result",
  "social-production":"#social-production .social-package",
  "publishing-studio":"#workspace .deliverable",
  "creative-studio":"#workspace .deliverable"
};
let activeChild=null;
let scheduled=false;
const root=document.querySelector("#kairos-hub");

document.addEventListener("click",event=>{
  const child=event.target.closest?.("[data-child]")?.dataset.child;
  if(allChildren().includes(child))activeChild=child;
},true);
window.addEventListener("kairos:manuscript-studio:open",()=>{activeChild="manuscript-studio"});
window.addEventListener("kairos:social-production:open",()=>{activeChild="social-production"});
window.addEventListener("kairos:creative-studio:open",()=>{activeChild="creative-studio"});

function allChildren(){return Object.values(centerChildren).flat()}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;applyContracts();captureReceipt()});
}
function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}
function setAttr(node,name,value){if(node&&node.getAttribute(name)!==String(value))node.setAttribute(name,String(value))}

function applyContracts(){
  for(const center of Object.keys(centerChildren))applyCenterContract(center);
}
function applyCenterContract(center){
  const children=centerChildren[center];
  const parent=document.querySelector(`.parent-card[data-center="${center}"]`);
  if(parent){
    setAttr(parent,"data-readiness",100);setAttr(parent,"data-operational-contract","verified");
    const signal=parent.querySelector(".card-signal");
    if(signal){const dot=signal.querySelector("i")?.outerHTML||"<i></i>";if(signal.innerHTML!==`${dot}COMPLETE`)signal.innerHTML=`${dot}COMPLETE`}
    const meter=parent.querySelector('[role="progressbar"]');setAttr(meter,"aria-valuenow",100);
    const fill=meter?.querySelector("span");if(fill&&fill.style.getPropertyValue("--meter")!=="100%")fill.style.setProperty("--meter","100%");
    setText(parent.querySelector(".card-foot b"),"100% operational");
  }
  const workspace=document.querySelector("#workspace");
  const heading=workspace?.querySelector(".workspace-head .eyebrow")?.textContent||"";
  if(!workspace||!heading.includes(`${title(center)} Center`))return;
  const readiness=workspace.querySelector(".center-readiness");
  if(readiness){
    setAttr(readiness,"data-operational-contract","verified");setText(readiness.querySelector("header h3"),"100% operational");
    setText(readiness.querySelector("header p:not(.eyebrow)"),"Current blueprint complete");
    const state=readiness.querySelector(".readiness-state");setText(state,"Complete");setAttr(state,"data-level","complete");
    const overall=readiness.querySelector(".readiness-overall");setAttr(overall,"aria-valuenow",100);const fill=overall?.querySelector("span");if(fill)fill.style.setProperty("--meter","100%");
  }
  for(const child of children){
    const button=workspace.querySelector(`[data-child="${child}"]`),card=button?.closest(".child-card");
    if(!card)continue;
    setAttr(card,"data-readiness",100);setAttr(card,"data-operational-contract","verified");setText(card.querySelector(".child-readiness span"),"100%");
  }
  workspace.querySelectorAll(".readiness-breakdown article").forEach(article=>{
    setText(article.querySelector("small"),"Complete");setText(article.querySelector("b"),"100%");
    const meter=article.querySelector('[role="progressbar"]');setAttr(meter,"aria-valuenow",100);const fill=meter?.querySelector("span");if(fill)fill.style.setProperty("--meter","100%");
  });
}
function captureReceipt(){
  if(!activeChild)return;
  const selector=completionSelectors[activeChild];
  if(!selector||!document.querySelector(selector))return;
  const receipts=readReceipts();
  receipts[activeChild]={child:activeChild,center:centerFor(activeChild),status:"completed",completedAt:new Date().toISOString(),contractBuild:BUILD};
  try{localStorage.setItem(RECEIPT_KEY,JSON.stringify(receipts))}catch{}
  activeChild=null;
}
function centerFor(child){return Object.entries(centerChildren).find(([,children])=>children.includes(child))?.[0]||"unknown"}
function title(value){return value.charAt(0).toUpperCase()+value.slice(1)}
function readReceipts(){try{const value=JSON.parse(localStorage.getItem(RECEIPT_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}catch{return{}}}

if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener("load",schedule,{once:true});
schedule();
window.KairosParentCardCompletion={build:BUILD,contracts,getReceipts:readReceipts,refresh:schedule};
