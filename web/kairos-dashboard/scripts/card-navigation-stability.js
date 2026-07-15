const BUILD="kairos-card-navigation-stability-20260715-2";
const ACTIVE_KEY="kairos.command-center.active-card";
const root=document.querySelector("#kairos-hub");
const host=ensureHost();
let scheduled=false;
let reconciling=false;

document.addEventListener("click",event=>{
  const parent=event.target.closest?.("[data-center]");
  if(parent){writeActive({type:"center",id:parent.dataset.center,openedAt:new Date().toISOString()});return;}
  const child=event.target.closest?.("[data-child]");
  if(child)writeActive({type:"child",id:child.dataset.child,openedAt:new Date().toISOString()});
  if(event.target.closest?.("[data-back],[data-close],[data-close-job],[data-close-destination]"))clearActive();
},true);

window.addEventListener("kairos:production:close",clearActive);
window.addEventListener("kairos:production:state-changed",schedule);
window.addEventListener("kairos:social-production:open",schedule);
window.addEventListener("kairos:creative-studio:open",schedule);
window.addEventListener("kairos:campaign-operations:open",schedule);
window.addEventListener("load",schedule,{once:true});

function ensureHost(){
  let node=document.querySelector("#kairos-stable-workspace-host");
  if(node)return node;
  node=document.createElement("div");
  node.id="kairos-stable-workspace-host";
  node.dataset.navigationStability=BUILD;
  node.style.overflowAnchor="none";
  if(root?.parentNode)root.insertAdjacentElement("afterend",node);else document.body.appendChild(node);
  return node;
}

function schedule(){
  if(scheduled||reconciling)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    reconciling=true;
    observer?.disconnect();
    try{stabilize()}finally{
      reconciling=false;
      if(root)observer?.observe(root,{childList:true,subtree:true});
    }
  });
}

function stabilize(){
  moveStableWorkspace("#social-production");
  moveStableWorkspace("#creative-studio");
  moveStableWorkspace("#publishing-studio");
  moveStableWorkspace("#campaign-operations");
  moveStableWorkspace("#product-launch-studio");
  const active=readActive();
  document.documentElement.toggleAttribute("data-kairos-card-open",Boolean(active));
}

function moveStableWorkspace(selector){
  const node=root?.querySelector(selector);
  if(!node||node.parentElement===host)return;
  host.appendChild(node);
}

function writeActive(value){try{sessionStorage.setItem(ACTIVE_KEY,JSON.stringify(value))}catch{}}
function readActive(){try{return JSON.parse(sessionStorage.getItem(ACTIVE_KEY)||"null")}catch{return null}}
function clearActive(){try{sessionStorage.removeItem(ACTIVE_KEY)}catch{}document.documentElement.removeAttribute("data-kairos-card-open")}
const observer=root?new MutationObserver(schedule):null;
if(root)observer.observe(root,{childList:true,subtree:true});
schedule();
window.KairosCardNavigationStability={build:BUILD,stabilize:schedule,getActive:readActive,clear:clearActive};