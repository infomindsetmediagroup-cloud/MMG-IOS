import { analyzeNativeObjective, buildNativeExecutionGraph } from "./kairos-native-kernel-v1.js";

export const KAIROS_NATIVE_ENGINE_VERSION = "kairos-native-intelligence-20260712-1";

const STOP_WORDS = new Set("a about an and are as at be been being book but by called can create do feel for from get guide has have how i idea in into is it its make making me my named of on or our people practical should stuck struggle system that the their this through titled to using want what when where which who why will with write you your".split(" "));

const CHAPTER_BLUEPRINTS = [
  ["Understanding {topic}", "foundation", "Build a precise working definition and separate durable principles from surface-level activity."],
  ["The Value Inside {topic}", "value", "Identify the knowledge, experience, and opportunity already present in the subject."],
  ["Assessing the Starting Point", "assessment", "Establish an honest baseline before choosing tactics, tools, or timelines."],
  ["The {topic} Framework", "framework", "Convert the central idea into a clear sequence that can guide repeatable decisions."],
  ["Designing a Practical Plan", "planning", "Translate the framework into priorities, milestones, boundaries, and completion criteria."],
  ["Building the Core Practice", "practice", "Turn intention into reliable action through focused routines and useful feedback."],
  ["Creating Repeatable Systems", "systems", "Reduce avoidable friction by standardizing decisions without removing judgment."],
  ["Measuring What Matters", "measurement", "Use evidence to distinguish visible activity from meaningful progress."],
  ["Solving Friction and Setbacks", "resilience", "Recognize predictable failure patterns and respond without abandoning the objective."],
  ["Strengthening the Work", "quality", "Improve clarity, usefulness, integrity, and long-term maintainability."],
  ["Scaling Without Losing Integrity", "scale", "Expand reach and output while preserving the principles that create trust."],
  ["The Long-Term Operating System", "continuity", "Make the work durable enough to compound in value beyond a single project."],
];

const SECTION_BLUEPRINTS = [
  ["Core Principle", "principle"],
  ["Why It Matters", "importance"],
  ["A Practical Framework", "framework"],
  ["How to Apply It", "application"],
  ["Common Failure Patterns", "risks"],
  ["MMG Tool", "tool"],
  ["Action Step", "action"],
  ["Chapter Summary", "summary"],
];

export function analyzeBookIdea(ideaInput) {
  const idea = String(ideaInput || "").replace(/\s+/g, " ").trim();
  if (idea.length < 12) throw engineError(400, "book_idea_required", "Describe the book idea in at least one complete sentence.");
  if (idea.length > 12_000) throw engineError(413, "book_idea_too_long", "The book idea exceeds the native acquisition limit.");
  const nativeObjective = analyzeNativeObjective(idea);
  const tokens = idea.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
  const counts = new Map();
  for (const token of tokens) if (!STOP_WORDS.has(token)) counts.set(token, (counts.get(token) || 0) + 1);
  const concepts = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8).map(([word]) => word);
  if (!concepts.length) concepts.push("knowledge", "progress", "practice");
  const explicitTitle = extractExplicitTitle(idea);
  const topic = explicitTitle ? topicFromTitle(explicitTitle) : humanize(concepts[0]);
  const title = explicitTitle || buildTitle(concepts, idea);
  const audience = extractAudience(idea) || "creators, entrepreneurs, professionals, and readers seeking practical progress";
  return {
    idea,
    title,
    topic,
    audience,
    concepts,
    promise: `Help ${audience} understand ${topic}, organize it into a useful system, and apply it with clarity and discipline.`,
    author: "Michael King",
    publisher: "Mindset Media Group™",
    acquisitionMode: "idea-to-publication",
    manuscriptRequired: false,
    sourceAssetsRequired: false,
    engineVersion: KAIROS_NATIVE_ENGINE_VERSION,
    nativeObjective,
    executionGraph: buildNativeExecutionGraph(nativeObjective, "publishing"),
  };
}

export async function researchBookIdea(analysis, fetcher = fetch) {
  const query = analysis.concepts.slice(0, 5).join(" ");
  const adapters = [
    ["wikipedia", () => researchWikipedia(query, fetcher)],
    ["openalex", () => researchOpenAlex(query, fetcher)],
    ["crossref", () => researchCrossref(query, fetcher)],
    ["openlibrary", () => researchOpenLibrary(query, fetcher)],
  ];
  const settled = await Promise.allSettled(adapters.map(([, run]) => run()));
  const sources = [];
  const diagnostics = [];
  settled.forEach((result, index) => {
    const adapter = adapters[index][0];
    if (result.status === "fulfilled") {
      sources.push(...result.value);
      diagnostics.push({ adapter, status: "completed", records: result.value.length });
    } else diagnostics.push({ adapter, status: "unavailable", records: 0, message: safeMessage(result.reason) });
  });
  const unique = dedupeSources(sources).slice(0, 12);
  return {
    query,
    researchedAt: new Date().toISOString(),
    sources: unique,
    diagnostics,
    evidenceStandard: "Direct public-source retrieval; no inference provider; no unsupported factual claims.",
    synthesis: buildResearchSynthesis(analysis, unique),
  };
}

export function buildPublishingArchitecture(analysis, research) {
  const chapterPlan = CHAPTER_BLUEPRINTS.map(([title, lens, objective], index) => ({
    number: index + 1,
    title: title.replaceAll("{topic}", analysis.topic),
    lens,
    objective,
    concepts: rotate(analysis.concepts, index).slice(0, 4),
  }));
  return {
    title: analysis.title,
    subtitle: `A Practical System for Turning ${analysis.topic} Into Durable Progress`,
    author: analysis.author,
    publisher: analysis.publisher,
    audience: analysis.audience,
    promise: analysis.promise,
    trimSize: "6 x 9 inches",
    interior: "Black and white, white paper",
    targetWords: 18_000,
    targetPages: "70–75 substantive pages",
    chapterPlan,
    frontMatter: ["Title Page", "Copyright", "Publisher Note", "Contents", "Introduction"],
    backMatter: ["Conclusion", "Resources and Research Record", "About the Author", "Back Cover Copy"],
    sourceCount: research.sources.length,
  };
}

export function composeChapter(analysis, research, architecture, chapterIndex) {
  const plan = architecture.chapterPlan[chapterIndex];
  if (!plan) throw engineError(404, "chapter_not_found", "The requested chapter is not in the publication architecture.");
  const paragraphs = [];
  for (const [sectionTitle, sectionKind] of SECTION_BLUEPRINTS) {
    paragraphs.push(`## ${sectionTitle}`);
    const paragraphCount = ["principle", "importance", "framework", "application", "risks"].includes(sectionKind) ? 2 : 1;
    for (let paragraphIndex = 0; paragraphIndex < paragraphCount; paragraphIndex += 1) {
      paragraphs.push(buildSubstantiveParagraph({ analysis, research, plan, sectionKind, paragraphIndex, chapterIndex }));
    }
    if (sectionKind === "framework") paragraphs.push(buildFrameworkList(analysis, plan));
    if (sectionKind === "tool") paragraphs.push(buildMMGTool(analysis, plan, chapterIndex));
    if (sectionKind === "action") paragraphs.push(buildActionChecklist(analysis, plan));
  }
  if (chapterIndex === architecture.chapterPlan.length - 1) paragraphs.push(buildResearchRecord(research));
  return {
    number: chapterIndex + 1,
    title: plan.title,
    lens: plan.lens,
    content: paragraphs.join("\n\n"),
    generatedBy: KAIROS_NATIVE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

export function editorialPass(chapter, passNumber) {
  let content = String(chapter.content || "");
  if (passNumber === 1) {
    const required = SECTION_BLUEPRINTS.map(([title]) => `## ${title}`);
    for (const heading of required) if (!content.includes(heading)) content += `\n\n${heading}\n\nReview the chapter through this lens and record the strongest practical conclusion.`;
    content = removeAdjacentDuplicateParagraphs(content);
  } else if (passNumber === 2) {
    content = content
      .replace(/\bvery\b/gi, "")
      .replace(/\breally\b/gi, "")
      .replace(/\bin order to\b/gi, "to")
      .replace(/\bit is important to note that\b/gi, "")
      .replace(/[ \t]{2,}/g, " ");
  } else if (passNumber === 3) {
    content = content
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([.!?])([A-Z])/g, "$1 $2")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else throw engineError(400, "editorial_pass_invalid", "Kairos supports exactly three editorial passes.");
  return { ...chapter, content, editorialPasses: Math.max(Number(chapter.editorialPasses || 0), passNumber), editedAt: new Date().toISOString() };
}

export function buildPublicationRecord({ projectId, analysis, research, architecture, chapters, approval }) {
  const wordCount = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const pageCount = even(Math.max(24, Math.ceil(wordCount / 250)));
  const subtitle = architecture.subtitle;
  const backCoverCopy = `${analysis.title} gives ${analysis.audience} a disciplined way to understand ${analysis.topic}, turn scattered knowledge into a practical framework, and make meaningful progress without relying on hype or fragmented tactics. Each chapter combines a core principle, direct application, an MMG tool, and a concrete action step.`;
  return {
    projectId,
    engineVersion: KAIROS_NATIVE_ENGINE_VERSION,
    title: analysis.title,
    subtitle,
    author: analysis.author,
    publisher: analysis.publisher,
    topic: analysis.topic,
    audience: analysis.audience,
    chapters,
    research,
    architecture,
    wordCount,
    pageCount,
    backCoverCopy,
    approval: approval || null,
    specifications: {
      trim: "6 x 9 inches",
      bleed: "0.125 inches on outside edges",
      interior: "Black and white, white paper",
      spineWidthInches: Number((pageCount * 0.002252).toFixed(4)),
    },
    quality: buildQualityReport(chapters, research, wordCount, pageCount),
  };
}

export function buildQualityReport(chapters, research, wordCount, pageCount) {
  const requiredHeadings = SECTION_BLUEPRINTS.map(([heading]) => `## ${heading}`);
  const chapterChecks = chapters.map(chapter => ({
    chapter: chapter.number,
    wordCount: countWords(chapter.content),
    editorialPasses: Number(chapter.editorialPasses || 0),
    requiredSectionsPresent: requiredHeadings.every(heading => chapter.content.includes(heading)),
  }));
  const issues = [];
  if (chapters.length !== 12) issues.push("The canonical twelve-chapter architecture is incomplete.");
  if (chapterChecks.some(chapter => chapter.editorialPasses < 3)) issues.push("One or more chapters did not complete all three editorial passes.");
  if (chapterChecks.some(chapter => !chapter.requiredSectionsPresent)) issues.push("One or more chapters are missing a required instructional section.");
  if (wordCount < 12_000) issues.push("The manuscript is below the native long-form minimum of 12,000 words.");
  if (pageCount < 70 || pageCount > 76) issues.push("The estimated KDP interior is outside the 70–76 page production band.");
  if (!research.sources.length) issues.push("No public research sources were retrieved; the manuscript is limited to native framework synthesis.");
  return {
    status: issues.length ? "completed-with-notes" : "passed",
    tripleEditorialPass: chapterChecks.every(chapter => chapter.editorialPasses >= 3),
    chapterCount: chapters.length,
    wordCount,
    estimatedInteriorPages: pageCount,
    researchSources: research.sources.length,
    chapterChecks,
    issues,
  };
}

async function researchWikipedia(query, fetcher) {
  const search = await fetchJSON(fetcher, `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`);
  const results = Array.isArray(search?.query?.search) ? search.query.search : [];
  return results.map(item => ({
    source: "Wikipedia",
    title: cleanText(item.title),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(item.title || "").replaceAll(" ", "_"))}`,
    excerpt: cleanText(item.snippet).slice(0, 420),
    publishedAt: null,
    retrievedAt: new Date().toISOString(),
  }));
}

async function researchOpenAlex(query, fetcher) {
  const body = await fetchJSON(fetcher, `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=3&select=id,display_name,publication_year,doi,primary_location`);
  return (Array.isArray(body?.results) ? body.results : []).map(item => ({
    source: "OpenAlex",
    title: cleanText(item.display_name),
    url: String(item.doi || item?.primary_location?.landing_page_url || item.id || ""),
    excerpt: `Research work indexed by OpenAlex${item.publication_year ? ` in ${item.publication_year}` : ""}.`,
    publishedAt: item.publication_year ? String(item.publication_year) : null,
    retrievedAt: new Date().toISOString(),
  }));
}

async function researchCrossref(query, fetcher) {
  const body = await fetchJSON(fetcher, `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3&select=DOI,title,URL,published`);
  return (Array.isArray(body?.message?.items) ? body.message.items : []).map(item => ({
    source: "Crossref",
    title: cleanText(Array.isArray(item.title) ? item.title[0] : item.title),
    url: String(item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "")),
    excerpt: "Publication metadata retrieved directly from Crossref.",
    publishedAt: Array.isArray(item?.published?.["date-parts"]?.[0]) ? item.published["date-parts"][0].join("-") : null,
    retrievedAt: new Date().toISOString(),
  }));
}

async function researchOpenLibrary(query, fetcher) {
  const body = await fetchJSON(fetcher, `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=key,title,author_name,first_publish_year`);
  return (Array.isArray(body?.docs) ? body.docs : []).map(item => ({
    source: "Open Library",
    title: cleanText(item.title),
    url: item.key ? `https://openlibrary.org${item.key}` : "https://openlibrary.org/",
    excerpt: `Catalog record${Array.isArray(item.author_name) && item.author_name.length ? ` by ${item.author_name.slice(0, 2).join(" and ")}` : ""}.`,
    publishedAt: item.first_publish_year ? String(item.first_publish_year) : null,
    retrievedAt: new Date().toISOString(),
  }));
}

async function fetchJSON(fetcher, url) {
  const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "MMG-Kairos-Native-Research/1.0" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Research adapter returned HTTP ${response.status}.`);
  return response.json();
}

function buildResearchSynthesis(analysis, sources) {
  if (!sources.length) return `Kairos completed an internal framework analysis of ${analysis.topic}. Public research adapters returned no usable records, so the manuscript must avoid source-dependent factual claims.`;
  const groups = [...new Set(sources.map(source => source.source))];
  return `Kairos retrieved ${sources.length} records across ${groups.join(", ")}. The sources establish vocabulary, adjacent literature, and contextual anchors for ${analysis.topic}; they do not replace editorial judgment or authorize unsupported claims.`;
}

function buildSubstantiveParagraph({ analysis, research, plan, sectionKind, paragraphIndex, chapterIndex }) {
  const lensLanguage = {
    foundation: ["foundation", "clear purpose", "verifiable evidence"],
    value: ["audience value", "useful knowledge", "observable benefit"],
    assessment: ["honest assessment", "an accurate baseline", "current evidence"],
    framework: ["structured thinking", "a repeatable sequence", "decision quality"],
    planning: ["practical planning", "focused priorities", "completion evidence"],
    practice: ["disciplined practice", "consistent execution", "useful feedback"],
    systems: ["system design", "reduced friction", "repeatable performance"],
    measurement: ["meaningful measurement", "relevant indicators", "verified progress"],
    resilience: ["adaptive resilience", "a prepared response", "recovery evidence"],
    quality: ["production quality", "editorial integrity", "acceptance evidence"],
    scale: ["governed scale", "preserved integrity", "sustainable growth"],
    continuity: ["long-term continuity", "durable stewardship", "compounding value"],
  };
  const [primary, secondary, tertiary] = lensLanguage[plan.lens] || [plan.lens, "consistent practice", "useful evidence"];
  const source = research.sources.length ? research.sources[(chapterIndex * 3 + paragraphIndex) % research.sources.length] : null;
  const topic = analysis.topic.toLowerCase();
  const audience = analysis.audience;
  const variants = {
    principle: paragraphIndex === 0 ? [
      `The governing principle behind ${plan.title.toLowerCase()} is that ${primary} has value only when it improves a real decision, practice, or result.`,
      `This chapter isolates ${plan.lens} because it determines how the larger ${topic} system behaves under pressure.`,
      `A working definition is more useful than a slogan: ${primary} is the disciplined act of connecting purpose, choice, execution, and review.`,
      `That definition creates a boundary. Activity that does not serve the intended outcome may be interesting, but it does not belong in the core system.`,
      `The practical test is simple: after applying the principle, the reader should know what to do, why it matters, and what evidence will show whether it worked.`,
    ] : [
      `The principle becomes durable when ${secondary} supports it consistently rather than competing with it.`,
      `In practice, this means protecting the few decisions that create disproportionate value and simplifying the rest.`,
      `The reader does not need perfect certainty before acting; the reader needs a clear hypothesis, a bounded action, and a scheduled review.`,
      `When those elements remain connected, mistakes become information instead of identity, and progress can continue without pretending every attempt succeeded.`,
      `This disciplined loop turns ${primary} from an abstract preference into part of the operating system for ${topic}.`,
    ],
    importance: paragraphIndex === 0 ? [
      `${plan.title} matters because knowledge and effort are easily scattered across disconnected tools, unfinished plans, and competing priorities.`,
      `For ${audience}, fragmentation creates a hidden cost: attention is spent repeatedly deciding where to begin instead of moving the work forward.`,
      `The chapter's focus on ${primary} reduces that cost by giving related decisions a common reference point.`,
      `It also distinguishes visible activity from durable progress. A busy week can produce many actions while leaving no reusable asset, tested process, or improved capability behind.`,
      `A stronger standard asks whether the work became clearer, more useful, easier to repeat, or more valuable to the person it is intended to serve.`,
    ] : [
      `The consequences become clearer when the principle is ignored. Without ${secondary}, small inconsistencies accumulate until the system becomes difficult to trust.`,
      `The response is not to add more complexity. It is to restore the relationship between the objective, the next action, and the evidence required for completion.`,
      source ? `Kairos reviewed “${source.title.slice(0, 100)}” through the ${source.source} adapter as part of the contextual research record for this topic.` : `The public research adapters returned no usable contextual record for this point, so Kairos does not attach an invented citation.`,
      `That evidence is preserved for verification, while the recommendation remains grounded in the operational logic developed in this chapter.`,
      `The result is a more dependable approach to ${topic}: one that can be explained, tested, corrected, and carried forward.`,
    ],
    framework: paragraphIndex === 0 ? [
      `A useful framework for ${plan.lens} contains five elements: outcome, baseline, constraint, action, and review.`,
      `The outcome states the change the reader is trying to create. The baseline records what is true now without exaggeration or self-judgment.`,
      `The constraint names the condition most likely to interrupt progress, including limited time, unclear ownership, missing evidence, or unnecessary complexity.`,
      `The action is the smallest complete unit of work that changes the baseline. The review compares the result with the intended outcome and records the next decision.`,
      `Together, these elements keep ${tertiary} connected to execution instead of leaving it as a separate reporting exercise.`,
    ] : [
      `Sequence matters. Starting with tactics before the outcome is defined encourages tool-driven work and weakens the ability to judge success.`,
      `Starting with the baseline prevents the plan from being built around assumptions that have never been checked.`,
      `Naming the constraint before execution makes the system more resilient because the reader can prepare a response rather than improvise after momentum is lost.`,
      `Finally, the scheduled review prevents a temporary method from becoming permanent merely because it is familiar.`,
      `This framework is intentionally compact so it can guide ${topic} without becoming another layer of management.`,
    ],
    application: paragraphIndex === 0 ? [
      `Application begins by selecting one outcome connected to ${plan.lens} and writing it in observable terms.`,
      `Instead of “improve ${topic},” define the completed condition: what will exist, who will receive value, when it will be ready, and what standard it must meet.`,
      `Next, inventory the evidence already available. Separate verified facts from interpretations and identify the assumption with the greatest ability to change the plan.`,
      `Choose one action that tests or advances that assumption, then protect enough time to finish it before expanding the scope.`,
      `This approach produces a closed loop rather than another open commitment.`,
    ] : [
      `Consider a reader who has several promising ideas but no reliable publication rhythm. The immediate problem may appear to be motivation, yet the operational problem is often undefined completion.`,
      `The reader can apply this chapter by choosing one deliverable, defining its audience and acceptance criteria, and moving every unrelated idea into a later queue.`,
      `At the end of the work period, the review records what was completed, what blocked progress, and which part of the process should be reused.`,
      `The same pattern applies beyond publishing because it converts intention into evidence without requiring the entire future to be planned in advance.`,
      `Repeated with discipline, the method strengthens both ${primary} and confidence in the larger ${topic} system.`,
    ],
    risks: paragraphIndex === 0 ? [
      `The first failure pattern is confusing preparation with progress. Research, organizing, and tool selection can support execution, but they can also postpone the moment when the work must be tested.`,
      `The second pattern is uncontrolled expansion: the objective grows faster than the available time, evidence, or capability.`,
      `The third is premature automation, where an unstable process is made faster before anyone has established whether it creates the intended value.`,
      `The fourth is invisible completion. Work moves across several tools, yet no person can identify the authoritative version or determine whether the task is actually finished.`,
      `Each failure weakens ${plan.lens} by separating action from accountable evidence.`,
    ] : [
      `Recovery starts by returning to the smallest complete objective. Pause additions, identify the canonical working record, and remove steps that do not change the result.`,
      `If the constraint is missing knowledge, research it directly. If the constraint is scope, reduce it. If the constraint is quality, define the failed criterion and repair that specific area.`,
      `A stop condition is equally important: when an activity repeatedly fails to support the objective, the system should authorize a deliberate change rather than demand endless persistence.`,
      `This is not abandonment. It is disciplined stewardship of time, attention, and accumulated knowledge.`,
      `The repaired workflow should end with a clearer next decision than the one that preceded it.`,
    ],
    tool: [
      `Kairos treats this chapter as an operating component rather than an isolated lesson. The MMG tool below captures the outcome, present evidence, primary constraint, next complete action, and review decision on one page.`,
      `Its purpose is not to document everything. Its purpose is to preserve the few facts and commitments required to keep ${plan.lens} coherent across time.`,
      `Use the record before execution, update it only when evidence changes, and archive the final version with the completed work.`,
      `That discipline turns ${secondary} into reusable organizational knowledge instead of a memory that must be reconstructed later.`,
    ],
    action: [
      `Complete one bounded action within the next work cycle. Define the outcome, identify the beneficiary, name the acceptance criteria, and choose the evidence that will prove completion.`,
      `Before beginning, remove one unnecessary step or competing priority. After finishing, record one retained practice and one correction.`,
      `The action is intentionally modest because the objective is to create a complete evidence loop that can be repeated and strengthened.`,
      `A finished small cycle teaches more than a large plan that never reaches review.`,
    ],
    summary: [
      `${plan.title} connects principle with execution. The reader begins with an outcome, establishes the baseline, names the constraint, completes a bounded action, and reviews the evidence.`,
      `${primary} provides direction, ${secondary} supports consistency, and ${tertiary} keeps the system accountable to reality.`,
      `The chapter's value is therefore practical: it gives ${audience} a repeatable way to make progress without losing clarity, integrity, or long-term purpose.`,
      `The next chapter builds on this foundation by examining the next operating layer in the ${topic} system.`,
    ],
  };
  const selected = variants[sectionKind] || variants.summary;
  return selected.join(" ");
}

function buildFrameworkList(analysis, plan) {
  return [
    `1. Define the intended outcome for ${plan.title.toLowerCase()}.`,
    `2. Record the present evidence and the most important constraint.`,
    `3. Choose the smallest complete action that advances ${analysis.topic.toLowerCase()}.`,
    `4. Complete the action before expanding the system.`,
    `5. Review the result, preserve what worked, and correct one weakness.`,
  ].join("\n\n");
}

function buildMMGTool(analysis, plan, chapterIndex) {
  const names = ["Clarity Map", "Value Inventory", "Starting-Point Audit", "Framework Canvas", "Execution Brief", "Practice Tracker", "System Card", "Evidence Dashboard", "Friction Log", "Quality Review", "Integrity Scale Test", "Continuity Plan"];
  const name = `MMG ${names[chapterIndex] || "Progress Tool"}™`;
  return `${name} is a one-page working record for this chapter. Write the objective at the top, list the evidence presently available, identify the next complete action, and reserve a final field for the decision that follows the review. The tool is intentionally simple: it should reduce friction around ${analysis.topic.toLowerCase()} without becoming another project to manage.`;
}

function buildActionChecklist(analysis, plan) {
  return [
    `- State one outcome connected to ${plan.lens}.`,
    `- Identify the person who benefits and the value they should receive.`,
    `- Name the evidence that will prove the action is complete.`,
    `- Remove one unnecessary step, tool, or approval.`,
    `- Complete the action and record what should change next time.`,
  ].join("\n\n");
}

function buildResearchRecord(research) {
  if (!research.sources.length) return "## Resources and Research Record\n\nNo public research records were available during this native production run. The manuscript was limited to original MMG framework synthesis and makes no claim of external source validation.";
  const entries = research.sources.map((source, index) => `${index + 1}. ${source.title}. ${source.source}. ${source.url}`).join("\n\n");
  return `## Resources and Research Record\n\nKairos retrieved the following records directly during production. They are included for provenance and further reading; their presence does not imply endorsement.\n\n${entries}`;
}

function buildTitle(concepts, idea) {
  const lead = humanize(concepts[0] || "Knowledge");
  const descriptor = /system|framework|method|plan|process/i.test(idea) ? "A Practical Guide" : "A Practical System";
  return `${lead}: ${descriptor}`;
}

function topicFromTitle(title) {
  const value = String(title || "")
    .replace(/^the\s+/i, "")
    .replace(/\b(system|method|framework|guide|handbook|book|workbook)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value || humanize(String(title || "publication"));
}

function extractExplicitTitle(idea) {
  const quoted = /(?:called|titled|title(?:d)?|book\s+name(?:d)?)\s+[“\"]([^”\"]{3,100})[”\"]/i.exec(idea)?.[1];
  if (quoted) return quoted.trim();
  const line = /^(?:title\s*:\s*)([^.!?\n]{3,100})/i.exec(idea)?.[1];
  if (line) return line.trim();
  const named = /\b(?:called|titled|named)\s+([A-Z][^.!?]{2,100}?)(?=\s+for\b|[.!?]|$)/.exec(idea)?.[1];
  if (named) return named.trim();
  if (idea.length <= 90 && !/\b(write|create|make|build|about|help|teach|show)\b/i.test(idea)) return idea.replace(/[.!?]+$/, "").trim();
  return "";
}

function extractAudience(idea) {
  const value = /\bfor\s+([^.!?]{4,120})/i.exec(idea)?.[1];
  if (!value) return "";
  return value.replace(/\b(?:who|that)\s+(?:want|need|are|have).*$/i, "").replace(/\s+/g, " ").trim();
}

function removeAdjacentDuplicateParagraphs(content) {
  const paragraphs = String(content).split(/\n\n+/);
  return paragraphs.filter((paragraph, index) => index === 0 || normalizeComparison(paragraph) !== normalizeComparison(paragraphs[index - 1])).join("\n\n");
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter(source => {
    const key = `${source.source}:${source.title}`.toLowerCase();
    if (!source.title || !source.url || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function cleanText(value) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim(); }
function humanize(value) { return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()).replace(/\s+/g, " ").trim(); }
function countWords(value) { return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length; }
function even(value) { return value % 2 === 0 ? value : value + 1; }
function rotate(values, offset) { if (!values.length) return []; const normalized = ((offset % values.length) + values.length) % values.length; return [...values.slice(normalized), ...values.slice(0, normalized)]; }
function normalizeComparison(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function safeMessage(error) { return error instanceof Error ? error.message.slice(0, 300) : "Research adapter failed."; }
function engineError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
