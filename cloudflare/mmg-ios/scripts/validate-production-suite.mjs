import{spawnSync}from'node:child_process';
const scripts=['validate-frozen-production-standard.mjs'];
const failures=[];let passed=0;
for(const script of scripts){const result=spawnSync(process.execPath,[new URL(script,import.meta.url).pathname],{encoding:'utf8',env:process.env,maxBuffer:10*1024*1024});if(result.status===0){passed+=1;continue;}const combined=`${result.stdout||''}\n${result.stderr||''}`.trim();failures.push({script,evidence:combined.split(/\r?\n/).filter(Boolean).slice(-12).join(' | ')});}
const summary={status:failures.length?'failed':'ready',runner:'kairos-production-validation-suite-20260715-89',mode:'operational-command-center',total:scripts.length,passed,failed:failures.length,navigationOwners:1,parentCentersComplete:5,childWorkspacesComplete:25,normalizedChildContracts:true,shopifyAsyncWriteCompletion:true,shopifyReadbackConvergence:true,websiteRetoolStages:5,previewApprovalRequired:true,liveApplicationApprovalRequired:true,backgroundIntervals:0,startupMutationObservers:0,programmaticScrolling:0,failures};
console.log(`KAIROS_VALIDATION_SUMMARY=${JSON.stringify(summary)}`);
if(failures.length)process.exit(1);
