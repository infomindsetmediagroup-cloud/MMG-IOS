const BUILD="kairos-command-center-governance-20260713-1";
const FORBIDDEN_LAUNCHERS=[".manuscript-launch",".social-production-launch"];

window.addEventListener("kairos:manuscript-studio:open",()=>openLegacyTool(".manuscript-launch"));
window.addEventListener("load",()=>setTimeout(enforce,1600),{once:true});
new MutationObserver(enforce).observe(document.documentElement,{childList:true,subtree:true});

function enforce(){
  FORBIDDEN_LAUNCHERS.forEach(selector=>{
    document.querySelectorAll(selector).forEach(element=>{
      element.hidden=true;
      element.setAttribute("aria-hidden","true");
      element.setAttribute("tabindex","-1");
      element.dataset.embeddedEntry="true";
    });
  });
  const parents=[...document.querySelectorAll(".parent-card")];
  if(parents.length&&parents.length!==5)console.error(`[${BUILD}] Command Center must contain exactly five parent cards.`);
}

function openLegacyTool(selector,attempt=0){
  const launcher=document.querySelector(selector);
  if(launcher){launcher.click();return;}
  if(attempt<30)setTimeout(()=>openLegacyTool(selector,attempt+1),100);
  else console.error(`[${BUILD}] Embedded tool launcher is unavailable: ${selector}`);
}
