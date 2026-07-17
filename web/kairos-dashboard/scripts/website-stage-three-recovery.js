const BUILD="kairos-website-stage-three-recovery-20260715-2";
const WEBSITE_ROUTE="/center/content/website";
let watchTimer=null;
let watchDeadline=0;

function onWebsiteRoute(){return location.pathname===WEBSITE_ROUTE;}

function startStageThreeWatch(){
  if(!onWebsiteRoute())return;
  stopStageThreeWatch();
  watchDeadline=Date.now()+10*60*1000;
  watchTimer=setInterval(inspectStageThree,400);
  inspectStageThree();
}

function stopStageThreeWatch(){
  if(watchTimer!==null)clearInterval(watchTimer);
  watchTimer=null;
}

function inspectStageThree(){
  if(!onWebsiteRoute()||Date.now()>watchDeadline){stopStageThreeWatch();return;}
  const view=document.querySelector("#command-view");
  if(!view)return;

  const previewReady=view.querySelector('.website-stage[data-stage="preview"].active');
  if(previewReady){stopStageThreeWatch();return;}

  const executing=view.querySelector('.website-stage[data-stage="stage"].active');
  if(executing)return;

  const planStage=view.querySelector('.website-stage[data-stage="plan"].active');
  const error=view.querySelector('.job.routed-job .error');
  const retry=view.querySelector('[data-website-execute]');
  if(!planStage||!error||!retry)return;

  view.querySelectorAll('.website-stage').forEach(stage=>stage.classList.remove('active'));
  planStage.classList.add('done');
  const buildStage=view.querySelector('.website-stage[data-stage="stage"]');
  if(buildStage)buildStage.classList.add('active');

  const banner=view.querySelector('.website-status-banner');
  if(banner){
    banner.classList.add('preview');
    const label=banner.querySelector('span');
    const title=banner.querySelector('strong');
    if(label)label.textContent='Step 3 · Build Preview';
    if(title)title.textContent='The approved proposal is preserved. Retry the preview build or revise the request.';
  }

  retry.textContent='Retry Build Preview';
  retry.removeAttribute('disabled');
  error.id='website-stage-three-error';
  retry.setAttribute('aria-describedby',error.id);
  if(!view.querySelector('[data-stage-three-preserved]')){
    error.insertAdjacentHTML('beforebegin','<p class="status-line" data-stage-three-preserved><strong>Step three remains active.</strong> No live website changes were made.</p>');
  }
  stopStageThreeWatch();
}

document.addEventListener('click',event=>{
  if(event.target.closest('[data-website-execute]'))startStageThreeWatch();
  if(event.target.closest('[data-website-plan],[data-website-revise],[data-website-new]'))stopStageThreeWatch();
},{capture:true});
window.addEventListener('popstate',stopStageThreeWatch);
window.KairosWebsiteStageThreeRecovery={build:BUILD,start:startStageThreeWatch,stop:stopStageThreeWatch};
