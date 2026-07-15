const BUILD="kairos-viewport-stability-lock-20260715-2";
const nativeFocus=HTMLElement.prototype.focus;
const nativeScrollIntoView=Element.prototype.scrollIntoView;
const nativeScrollTo=window.scrollTo.bind(window);
const nativeScrollBy=window.scrollBy.bind(window);
let explicitNavigationUntil=0;
let userGesture=false;
let userSettlingUntil=performance.now()+1800;
let stableY=window.scrollY;
let restoreQueued=false;
let lastTouchY=null;

function allowExplicitNavigation(ms=700){
  explicitNavigationUntil=Date.now()+ms;
  userSettlingUntil=performance.now()+ms;
}
function programmaticNavigationAllowed(){return Date.now()<=explicitNavigationUntil;}
function userMovementAllowed(){return userGesture||performance.now()<=userSettlingUntil||programmaticNavigationAllowed();}
function rememberPosition(){stableY=Math.max(0,window.scrollY||window.pageYOffset||0);}
function beginUserMovement(){userGesture=true;userSettlingUntil=performance.now()+1800;rememberPosition();}
function continueUserMovement(){userSettlingUntil=performance.now()+1800;rememberPosition();}
function endUserMovement(){userGesture=false;userSettlingUntil=performance.now()+1800;rememberPosition();}
function restoreStablePosition(){
  if(restoreQueued||userMovementAllowed())return;
  const current=window.scrollY||window.pageYOffset||0;
  if(Math.abs(current-stableY)<2)return;
  restoreQueued=true;
  requestAnimationFrame(()=>{
    restoreQueued=false;
    if(userMovementAllowed())return;
    const now=window.scrollY||window.pageYOffset||0;
    if(Math.abs(now-stableY)>=2)nativeScrollTo(0,stableY);
  });
}

window.scrollTo=function(...args){if(!programmaticNavigationAllowed())return;return nativeScrollTo(...args)};
window.scrollBy=function(...args){if(!programmaticNavigationAllowed())return;return nativeScrollBy(...args)};
Element.prototype.scrollIntoView=function(...args){if(!programmaticNavigationAllowed())return;return nativeScrollIntoView.apply(this,args)};
HTMLElement.prototype.focus=function(options){
  const next=options&&typeof options==="object"?{...options,preventScroll:true}:{preventScroll:true};
  return nativeFocus.call(this,next);
};

document.addEventListener("touchstart",event=>{
  lastTouchY=event.touches?.[0]?.clientY??null;
  beginUserMovement();
},{capture:true,passive:true});
document.addEventListener("touchmove",event=>{
  const y=event.touches?.[0]?.clientY??null;
  if(y!==null&&lastTouchY!==null&&Math.abs(y-lastTouchY)>1)continueUserMovement();
  lastTouchY=y;
},{capture:true,passive:true});
document.addEventListener("touchend",()=>{lastTouchY=null;endUserMovement()},{capture:true,passive:true});
document.addEventListener("touchcancel",()=>{lastTouchY=null;endUserMovement()},{capture:true,passive:true});
document.addEventListener("pointerdown",beginUserMovement,{capture:true,passive:true});
document.addEventListener("pointerup",endUserMovement,{capture:true,passive:true});
document.addEventListener("wheel",()=>{userSettlingUntil=performance.now()+900;rememberPosition()},{capture:true,passive:true});
document.addEventListener("keydown",event=>{
  if(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"," "].includes(event.key)){
    userSettlingUntil=performance.now()+900;
    rememberPosition();
  }
},true);

document.addEventListener("click",event=>{
  if(event.target.closest?.("[data-center],[data-child],[data-back],[data-command-menu],[data-command-center-target]"))allowExplicitNavigation(700);
},true);

window.addEventListener("scroll",()=>{
  if(userMovementAllowed())rememberPosition();
  else restoreStablePosition();
},{passive:true});
window.visualViewport?.addEventListener("scroll",()=>{
  if(userMovementAllowed())rememberPosition();
  else restoreStablePosition();
},{passive:true});
window.visualViewport?.addEventListener("resize",()=>{
  userSettlingUntil=performance.now()+900;
  rememberPosition();
},{passive:true});
window.addEventListener("resize",()=>{
  userSettlingUntil=performance.now()+900;
  rememberPosition();
},{passive:true});
window.addEventListener("hashchange",()=>{
  if(!programmaticNavigationAllowed()&&location.hash)history.replaceState(null,"",location.pathname+location.search);
});

document.documentElement.style.scrollBehavior="auto";
document.documentElement.style.overflowAnchor="none";
document.body.style.overflowAnchor="none";
setTimeout(()=>{rememberPosition();userSettlingUntil=performance.now()+600},0);
setInterval(()=>{
  if(!userMovementAllowed())restoreStablePosition();
},250);

window.KairosViewportStabilityLock={build:BUILD,allowExplicitNavigation,rememberPosition};