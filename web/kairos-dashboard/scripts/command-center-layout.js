const BUILD="kairos-command-center-layout-static-20260715-1";
const layoutState={menuOpen:false,online:"Connecting",onlineState:"checking"};

document.addEventListener("click",handleCommandClick,true);
document.addEventListener("keydown",handleCommandKeydown,true);
applyLayout();
window.addEventListener("kairos:runtime-status",event=>{const detail=event.detail||{};layoutState.online=detail.online?"Online":"Unavailable";layoutState.onlineState=detail.online?"":"offline";updateStrip();});

function handleCommandClick(event){
 const toggle=event.target.closest?.("[data-command-menu]");
 if(toggle){event.preventDefault();event.stopImmediatePropagation();setMenuOpen(!layoutState.menuOpen,{focusMenu:!layoutState.menuOpen});return;}
 const center=event.target.closest?.("[data-menu-center]");
 if(center){event.preventDefault();event.stopImmediatePropagation();setMenuOpen(false);window.KairosCommandHub?.openCenter?.(center.dataset.menuCenter);return;}
}
function handleCommandKeydown(event){if(event.key==="Escape"&&layoutState.menuOpen){event.preventDefault();setMenuOpen(false,{restoreFocus:true});}}
function setMenuOpen(open,options={}){layoutState.menuOpen=Boolean(open);const button=document.querySelector("[data-command-menu]");const menu=document.querySelector("#command-center-menu");button?.setAttribute("aria-expanded",String(layoutState.menuOpen));button?.classList.toggle("is-open",layoutState.menuOpen);if(menu){menu.hidden=!layoutState.menuOpen;menu.classList.toggle("is-open",layoutState.menuOpen);}if(layoutState.menuOpen&&options.focusMenu)queueMicrotask(()=>menu?.querySelector("button")?.focus({preventScroll:true}));else if(!layoutState.menuOpen&&options.restoreFocus)queueMicrotask(()=>button?.focus({preventScroll:true}));}
function applyLayout(){const hub=document.querySelector("#kairos-hub");const header=hub?.querySelector(".app-header");const hero=hub?.querySelector(".hero");if(!hub||!header||!hero)return;const heroCopy=hero.querySelector(".hero-copy");if(heroCopy)heroCopy.textContent="Real-time visibility. Governed tools. Measurable outcomes.";let strip=hub.querySelector("#command-status-strip");if(!strip){strip=document.createElement("section");strip.id="command-status-strip";strip.className="command-status-strip";strip.innerHTML=`<button class="command-menu-button" type="button" aria-label="Open operating centers" aria-controls="command-center-menu" aria-expanded="false" data-command-menu><span></span><span></span><span></span></button><div class="command-indicator command-online"><i class="checking"></i><span>Connecting</span></div>`;header.insertAdjacentElement("afterend",strip);}let menu=hub.querySelector("#command-center-menu");if(!menu){menu=document.createElement("nav");menu.id="command-center-menu";menu.className="command-center-menu";menu.hidden=true;menu.setAttribute("aria-label","Operating centers");menu.innerHTML=[["Knowledge","knowledge"],["Content","content"],["Business","business"],["Customers","customers"],["Operations","operations"]].map(([label,id])=>`<button type="button" data-menu-center="${id}">${label}</button>`).join("");strip.insertAdjacentElement("afterend",menu);}updateStrip();}
function updateStrip(){const strip=document.querySelector("#command-status-strip");if(!strip)return;const dot=strip.querySelector(".command-online i");const text=strip.querySelector(".command-online span");if(dot)dot.className=layoutState.onlineState;if(text)text.textContent=layoutState.online;}
window.KairosCommandCenterLayout={build:BUILD,refresh:updateStrip,setMenuOpen};
