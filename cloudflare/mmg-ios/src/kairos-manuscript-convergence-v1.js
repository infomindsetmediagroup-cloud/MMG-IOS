import { analyzeBookIdea, buildPublishingArchitecture, editorialPass, buildPublicationRecord } from "./kairos-native-intelligence-engine-v1.js";
import { buildProductPackage } from "./kairos-product-page-package-v1.js";
import { buildCreationArtifact, creationArtifactContentType, creationArtifactNames } from "./kairos-creation-artifacts-v1.js";

const BUILD = "kairos-manuscript-convergence-20260713-1";
const TTL = 60 * 60;
const MAX_MANUSCRIPT_CHARS = 600000;

export async function handleManuscriptConvergence(request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/content/generate" && request.method === "POST") {
    const payload = await request.clone().json().catch(() => ({}));
    if (!payload?.manuscript?.text) return null;
    return createJob(request, payload);
  }
  const artifact = url.pathname.match(/^\/api\/publishing\/manuscript-jobs\/([a-f0-9-]+)\/artifacts\/([a-z0-9.-]+)$/i);
  if (artifact && request.method === "GET") return readArtifact(request, artifact[1], artifact[2]);
  return null;
}

async function createJob(request, payload) {
  const text = normalize(String(payload.manuscript.text || ""));
  if (text.length < 500) return json({ status:"needs-input", error:{ code:"manuscript_too_short", message:"The manuscript must contain at least 500 characters." } }, 400);
  if (text.length > MAX_MANUSCRIPT_CHARS) return json({ status:"needs-input", error:{ code:"manuscript_too_large", message:`The manuscript exceeds ${MAX_MANUSCRIPT_CHARS.toLocaleString()} characters.` } }, 413);

  const title = String(payload.title || payload.manuscript.title || "Untitled Manuscript").trim().slice(0, 180);
  const brief = String(payload.objective || `Polish and manufacture the supplied manuscript titled ${title} for its intended readers.`).trim();
  const analysis = analyzeBookIdea(brief.length >= 12 ? brief : `Polish and publish the supplied manuscript titled ${title}.`);
  analysis.title = title || analysis.title;
  analysis.acquisitionMode = "manuscript-to-publication";
  analysis.manuscriptRequired = true;

  const research = {
    query: analysis.topic,
    researchedAt: new Date().toISOString(),
    sources: [],
    diagnostics: [{ adapter:"customer-manuscript", status:"completed", records:1 }],
    evidenceStandard: "Customer-supplied manuscript preserved as the primary source. No unsupported external claims added.",
    synthesis: "The supplied manuscript is the authoritative source for this production project."
  };
  const architecture = buildPublishingArchitecture(analysis, research);
  const chapters = splitChapters(text).map((chapter, index) => {
    let current = { number:index + 1, title:chapter.title || `Chapter ${index + 1}`, lens:"source-manuscript", content:chapter.content, generatedBy:BUILD, generatedAt:new Date().toISOString(), sourcePreserved:true };
    current = editorialPass(current, 1);
    current = editorialPass(current, 2);
    current = editorialPass(current, 3);
    return current;
  });
  architecture.chapterPlan = chapters.map(chapter => ({ number:chapter.number, title:chapter.title, lens:"source-manuscript", objective:"Preserve, polish, and manufacture the supplied chapter." }));
  architecture.targetWords = countWords(text);
  architecture.targetPages = `${Math.max(24, Math.ceil(countWords(text) / 250))} estimated pages`;

  const projectId = crypto.randomUUID();
  const cover = decodeCover(payload.cover);
  const publication = buildPublicationRecord({ projectId, analysis, research, architecture, chapters, approval: cover ? { approved:true, source:"user-supplied-cover", decidedAt:new Date().toISOString() } : { approved:false, source:"cover-required-before-final-release", decidedAt:null } });
  publication.sourceManuscript = { name:String(payload.manuscript.name || "manuscript.txt").slice(0,160), format:String(payload.manuscript.format || "text"), checksum:String(payload.manuscript.checksum || ""), originalCharacters:text.length, originalWords:countWords(text), preserved:true };
  const product = buildProductPackage(publication);
  const record = { projectId, publication, product, cover: cover ? { ...cover, bytes:Array.from(cover.bytes) } : null };
  await caches.default.put(jobRequest(request, projectId), new Response(JSON.stringify(record), { headers:{ "Content-Type":"application/json", "Cache-Control":`max-age=${TTL}` } }));

  const names = creationArtifactNames(cover);
  const artifacts = names.map(name => ({ name, url:`/api/publishing/manuscript-jobs/${projectId}/artifacts/${name}` }));
  return json({
    status:"completed",
    build:BUILD,
    projectId,
    sourceMode:"manuscript",
    stage:"delivery",
    stageLabel:"Complete product package ready",
    overallProgress:100,
    title:publication.title,
    subtitle:publication.subtitle,
    wordCount:publication.wordCount,
    pageCount:publication.pageCount,
    coverProvided:Boolean(cover),
    coverRequiredBeforeCommercialRelease:!cover,
    manuscriptPreserved:true,
    editorialPasses:3,
    stages:[
      stage("source-intake","Source manuscript intake","completed"),
      stage("structure","Structure and chapter normalization","completed"),
      stage("editorial","Three editorial passes","completed"),
      stage("manufacturing","Publishing file manufacturing","completed"),
      stage("product","Product page and asset package","completed"),
      stage("delivery","Complete package delivery","completed")
    ],
    artifacts,
    preview:{ coverURL:artifacts.find(item=>/approved-cover|cover-preview|ebook-cover/.test(item.name))?.url || "", product },
    note:cover ? "The approved cover and supplied manuscript were preserved in the finished package." : "A production cover placeholder is included. Add an approved cover before commercial publication."
  }, 201);
}

async function readArtifact(request, projectId, name) {
  const cached = await caches.default.match(jobRequest(request, projectId));
  if (!cached) return json({ status:"not-found", error:{ code:"manuscript_job_not_found", message:"The manuscript production job expired or was not found." } }, 404);
  const record = await cached.json();
  const cover = record.cover ? { ...record.cover, bytes:new Uint8Array(record.cover.bytes) } : null;
  try {
    const bytes = await buildCreationArtifact(name, record.publication, record.product, cover);
    return new Response(bytes, { headers:{ "Content-Type":creationArtifactContentType(name), "Content-Disposition":`attachment; filename="${name}"`, "Cache-Control":"private, max-age=300", "X-Kairos-Build":BUILD } });
  } catch (error) {
    return json({ status:"failed", error:{ code:error?.code || "artifact_failed", message:error instanceof Error ? error.message : "Artifact generation failed." } }, Number(error?.status || 500));
  }
}

function splitChapters(text) {
  const heading = /^(?:chapter\s+\d+\b.*|#{1,3}\s+.+)$/gim;
  const matches = [...text.matchAll(heading)];
  if (matches.length >= 2) return matches.map((match,index) => ({ title:match[0].replace(/^#+\s*/,"").trim(), content:text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim() })).filter(item=>item.content);
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const target = Math.max(1500, Math.ceil(paragraphs.join("\n\n").length / 12));
  const chapters=[]; let buffer=[]; let size=0;
  for (const paragraph of paragraphs) { buffer.push(paragraph); size += paragraph.length; if (size >= target && chapters.length < 11) { chapters.push({ title:`Chapter ${chapters.length + 1}`, content:buffer.join("\n\n") }); buffer=[]; size=0; } }
  if (buffer.length) chapters.push({ title:`Chapter ${chapters.length + 1}`, content:buffer.join("\n\n") });
  return chapters.length ? chapters : [{ title:"Manuscript", content:text }];
}

function decodeCover(input) {
  if (!input?.dataBase64) return null;
  const type = String(input.type || "").toLowerCase();
  if (!["image/png","image/jpeg"].includes(type)) throw Object.assign(new Error("Cover must be PNG or JPEG."), { status:400, code:"cover_type_invalid" });
  const binary = atob(String(input.dataBase64).replace(/\s+/g,""));
  const bytes = Uint8Array.from(binary, character=>character.charCodeAt(0));
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw Object.assign(new Error("Cover must be 8 MB or smaller."), { status:413, code:"cover_size_invalid" });
  return { name:String(input.name || (type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png")), type, bytes, filename:type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png" };
}
function normalize(value){return value.replace(/\r\n?/g,"\n").replace(/\u0000/g,"").replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();}
function countWords(value){return (String(value).match(/\b[\w’'-]+\b/g)||[]).length;}
function stage(id,label,status){return{id,label,status};}
function jobRequest(request,id){return new Request(`${new URL(request.url).origin}/__kairos/manuscript-convergence/${id}`);}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
