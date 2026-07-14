import'./chrome-hamburger-controller.js';
const BUILD="kairos-content-access-cleanup-20260714-2";
window.addEventListener("kairos:manuscript-studio:open",openManuscript);
window.addEventListener("load",()=>setTimeout(removeFloatingLaunchers,3200),{once:true});
function openManuscript(){const launch=document.querySelector(".manuscript-launch");if(launch){launch.click();removeFloatingLaunchers();return}setTimeout(()=>{document.querySelector(".manuscript-launch")?.click();removeFloatingLaunchers()},500)}
function removeFloatingLaunchers(){document.querySelectorAll(".manuscript-launch,.social-production-launch").forEach(node=>node.remove())}
window.KairosContentAccessCleanup={build:BUILD,removeFloatingLaunchers};