const BUILD="kairos-website-stage-three-controller-20260715-2";
const WEBSITE_PATH="/center/content/website";
const POLL_MS=250;
const MAX_POLLS=2400;
let activeRun=0;

function onWebsiteRoute(){return location.pathname===WEBSITE_PATH;}

function stopRun(){activeRun+=1;}

function preserveStepThree(runID){
  if(runID!==activeRun||!onWebsiteRoute())return true;
  const view=document.querySelector("#command-view");
  if(!view)return false;
  const error=view.querySelector(".job.routed-job .error");
  const retry=view.querySelector("[data-website-execute]");
  const planStage=view.querySelector('.website-stage[data-stage="plan"]');
  const buildStage=view.querySelector('.website-stage[data-stage="stage"]');
  if(!error||!retry||!planStage||!buildStage)return false;
  const message=String(error.textContent||"").toLowerCase();
  if(!/(preview|staging|shopify|theme|build|execute|verification|write|read-back|job)/.test(message))return false;

  view.querySelectorAll(".website-stage").forEach(stage=>stage.classList.remove("active"));
  planStage.classList.add("done");
  buildStage.classList.add("active");
  retry.textContent="Retry Build Preview";
  retry.removeAttribute("disabled");

  const banner=view.querySelector(".website-status-banner");
  if(banner){
    banner.classList.add("preview");
    const label=banner.querySelector("span");
    const title=banner.querySelector("strong");
    if(label)label.textContent="Step 3 · Preview build interrupted";
    if(title)title.textContent="The approved proposal is preserved. Retry the staging build or revise the request.";
  }

  if(!view.querySelector("[data-stage-three-preserved]")){
    const note=document.createElement("p");
    note.className="status-line";
    note.dataset.stageThreePreserved="true";
    note.innerHTML="<strong>Step three is preserved.</strong> No live website changes were made.";
    error.before(note);
  }
  return true;
}

function watchBuildAttempt(){
  stopRun();
  const runID=activeRun;
  let polls=0;
  const timer=setInterval(()=>{
    polls+=1;
    if(runID!==activeRun||preserveStepThree(runID)||polls>=MAX_POLLS){
      clearInterval(timer);
    }
  },POLL_MS);
}

document.addEventListener("click",event=>{
  if(!onWebsiteRoute())return;
  if(event.target.closest("[data-website-execute]"))watchBuildAttempt();
  if(event.target.closest("[data-website-plan],[data-website-revise],[data-website-new]"))stopRun();
},{capture:true});

window.addEventListener("popstate",stopRun);
window.KairosWebsiteStageThreeController={build:BUILD,watchBuildAttempt};
