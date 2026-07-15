const BUILD="kairos-card-navigation-stability-20260715-1";
const ACTIVE_KEY="kairos.command-center.active-card";
const root=document.querySelector("#kairos-hub");
const host=ensureHost();
let lastScrollAt=0;
let lastScrollTarget="";
const nativeScroll=Element.prototype.scrollIntoView;

Element.prototype.scrollIntoView=function(options){
  const id=this.id||this.className||this.tagName;
  const now=Date.now();
  if(id===lastScrollTarget&&now-lastScrollAt<700)return;
  lastScrollTarget=id;
  lastScrollAt=now;
  const normalized=typeof options==="object"?{...options,behavior:"auto"}:{behavior:"auto",block:"start"};
  return nativeScroll.call(this,normalized);
};

document.addEventListener("click",event=>{
  const parent=event.target.closest?.("[data-center]");
  if(parent){writeActive({type:"center",id:parent.dataset.center,openedAt:new Date().toISOString()});return;}
  const child=event.target.closest?.("[data-child]");
  if(child)writeActive({type:"child",id:child.dataset.child,openedAt:new Date().toISOString()});
  if(event.target.closest?.("[data-back],[data-close],[data-close-job],[data-close-destination]"))clearActive();
},true);

window.addEventListener("kairos:production:close",clearActive);
window.addEventListener("kairos:production:state-changed",stabilize);
window.addEventListener("load",stabilize,{once:true});

const observer=new MutationObserver(stabilize);
observer.observe(document.body,{childList:true,subtree:true});
stabilize();

function ensureHost(){
  let node=document.querySelector("#kairos-stable-workspace-host");
  if(node)return node;
  node=document.createElement("div");
  node.id="kairos-stable-workspace-host";
  node.dataset.navigationStability=BUILD;
  if(root?.parentNode)root.insertAdjacentElement("afterend",node);else document.body.appendChild(node);
  return node;
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
  const node=document.querySelector(selector);
  if(!node||node.parentElement===host)return;
  if(root?.contains(node))host.appendChild(node);
}

function writeActive(value){try{sessionStorage.setItem(ACTIVE_KEY,JSON.stringify(value))}catch{}}
function readActive(){try{return JSON.parse(sessionStorage.getItem(ACTIVE_KEY)||"null")}catch{return null}}
function clearActive(){try{sessionStorage.removeItem(ACTIVE_KEY)}catch{}document.documentElement.removeAttribute("data-kairos-card-open")}

window.KairosCardNavigationStability={build:BUILD,stabilize,getActive:readActive,clear:clearActive};