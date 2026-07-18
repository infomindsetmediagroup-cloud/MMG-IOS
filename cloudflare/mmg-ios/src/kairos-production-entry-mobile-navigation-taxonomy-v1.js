import linkRuntime, { KairosProject } from "./kairos-production-entry-live-link-reconciliation-v1.js";
import { handleMobileNavigationTaxonomyBuild, KAIROS_MOBILE_NAV_TAXONOMY_BUILD } from "./kairos-mobile-navigation-taxonomy-publisher-20260718.js";

const BUILD = "kairos-production-entry-mobile-navigation-taxonomy-20260718-1";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const navigation = await handleMobileNavigationTaxonomyBuild(request, env);
      if (navigation) return stamp(navigation);
      return stamp(await linkRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({status:"failed",build:BUILD,mobileNavigationTaxonomy:KAIROS_MOBILE_NAV_TAXONOMY_BUILD,error:{code:error?.code||"mobile_navigation_taxonomy_entry_failed",message:error instanceof Error?error.message:"Kairos could not complete the mobile navigation taxonomy request."},safeguards:{linkReconciliationDelegatedUnchanged:true,resourceRuntimeDelegatedUnchanged:true,companyRuntimeDelegatedUnchanged:true,nativeHeaderPreserved:true,liveThemeChanged:false}},Number(error?.status||error?.statusCode||500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof linkRuntime.scheduled === "function") return linkRuntime.scheduled(controller, env, ctx);
  }
};

function stamp(response){const headers=new Headers(response.headers);headers.set("X-MMG-Mobile-Navigation-Taxonomy-Entry",BUILD);headers.set("X-MMG-Mobile-Navigation-Taxonomy",KAIROS_MOBILE_NAV_TAXONOMY_BUILD);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-MMG-Mobile-Navigation-Taxonomy-Entry":BUILD,"X-MMG-Mobile-Navigation-Taxonomy":KAIROS_MOBILE_NAV_TAXONOMY_BUILD}});}
