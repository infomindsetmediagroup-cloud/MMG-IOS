const BUILD="kairos-viewport-stability-lock-20260715-1";
const nativeFocus=HTMLElement.prototype.focus;
const nativeScrollIntoView=Element.prototype.scrollIntoView;
const nativeScrollTo=window.scrollTo.bind(window);
const nativeScrollBy=window.scrollBy.bind(window);
let explicitNavigationUntil=0;

function allowExplicitNavigation(ms=500){explicitNavigationUntil=Date.now()+ms;}
function programmaticNavigationAllowed(){return Date.now()<=explicitNavigationUntil;}

window.scrollTo=function(...args){if(!programmaticNavigationAllowed())return;return nativeScrollTo(...args)};
window.scrollBy=function(...args){if(!programmaticNavigationAllowed())return;return nativeScrollBy(...args)};
Element.prototype.scrollIntoView=function(...args){if(!programmaticNavigationAllowed())return;return nativeScrollIntoView.apply(this,args)};
HTMLElement.prototype.focus=function(options){
  const next=options&&typeof options==="object"?{...options,preventScroll:true}:{preventScroll:true};
  return nativeFocus.call(this,next);
};

document.addEventListener("click",event=>{
  if(event.target.closest?.("[data-center],[data-child],[data-back],[data-command-menu],[data-command-center-target]"))allowExplicitNavigation(350);
},true);

window.addEventListener("hashchange",()=>{
  if(!programmaticNavigationAllowed()&&location.hash)history.replaceState(null,"",location.pathname+location.search);
});

document.documentElement.style.scrollBehavior="auto";
document.documentElement.style.overflowAnchor="none";
document.body.style.overflowAnchor="none";

window.KairosViewportStabilityLock={build:BUILD,allowExplicitNavigation};
