const BUILD="kairos-parent-meter-stability-20260715-1";
const STYLE_ID="kairos-parent-meter-stability-style";
install();
function install(){
 if(document.getElementById(STYLE_ID))return;
 const style=document.createElement("style");
 style.id=STYLE_ID;
 style.textContent=`html{scroll-behavior:auto!important}.parent-card,.parent-card .mini-meter,.parent-card .card-foot{overflow-anchor:none}.parent-card .mini-meter span{transition:none!important;animation:none!important;transform:none!important}.parent-card[data-readiness="100"] .mini-meter span{width:100%!important}`;
 document.head.appendChild(style);
}
window.KairosParentMeterStability={build:BUILD,install};
