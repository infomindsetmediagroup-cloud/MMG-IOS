export const KAIROS_PRODUCT_PACKAGE_VERSION = "kairos-product-page-package-v1";

export const PRODUCT_ASSET_NAMES = Object.freeze([
  "product-hero.svg",
  "book-mockup.svg",
  "what-youll-learn.svg",
  "who-this-book-is-for.svg",
  "inside-the-book.svg",
  "prompt-framework.svg",
  "social-square.svg",
  "social-portrait.svg",
  "social-story.svg",
]);

export function buildProductPackage(publication) {
  const title = String(publication?.title || "Untitled Publication");
  const topic = String(publication?.topic || title);
  const promptBook = /prompt|artificial intelligence|\bai\b/i.test(title + " " + topic);
  const targetReader = promptBook
    ? "Beginners who want to use AI with greater clarity, confidence, and judgment."
    : "Readers who want a practical, beginner-friendly system they can apply immediately.";
  const benefits = promptBook ? [
    "Turn unclear ideas into specific, useful prompts.",
    "Add context, constraints, format, and quality requirements.",
    "Improve weak responses through disciplined follow-up prompts.",
    "Build reusable prompt templates for recurring work.",
    "Verify information and use AI responsibly.",
  ] : [
    "Understand the core idea in plain language.",
    "Apply a practical step-by-step framework.",
    "Replace scattered effort with repeatable systems.",
    "Recognize common failure patterns.",
    "Turn knowledge into durable progress.",
  ];
  const inside = (publication?.architecture?.chapterPlan || []).slice(0, 12).map(chapter => chapter.title);
  const promptExamples = promptBook ? [
    {
      before: "Write something about my business.",
      after: "Act as a clear business-writing assistant. Using the context below, write a 150-word About section for first-time customers. Use a confident, human tone, avoid unsupported claims, and end with one practical call to action.",
    },
    {
      before: "Give me content ideas.",
      after: "Create ten beginner-friendly short-form content ideas for an educational creator. For each idea provide the hook, audience problem, three teaching points, and a simple call to action. Avoid repeating the same angle.",
    },
  ] : [];
  const shortDescription = promptBook
    ? "A practical beginner’s guide to writing clearer prompts, improving AI responses, building reusable workflows, and applying human judgment."
    : "A practical guide that turns a complex subject into a clear, useful, and repeatable system.";
  const metaDescription = truncate(shortDescription + " Includes examples, frameworks, exercises, and a reusable action system.", 155);
  const product = {
    version: KAIROS_PRODUCT_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    title,
    subtitle: publication?.subtitle || "",
    author: publication?.author || "Michael King",
    publisher: publication?.publisher || "Mindset Media Group™",
    handle: slug(title),
    productType: "Book",
    tags: ["Mindset Media Group", "education", "beginner guide", promptBook ? "AI prompts" : slug(topic)].filter(Boolean),
    targetReader,
    shortDescription,
    valueProposition: promptBook
      ? "Learn how to communicate with AI clearly without giving up your judgment."
      : "Turn knowledge into a clear system you can understand and use.",
    benefits,
    whatYouWillLearn: benefits,
    insideTheBook: inside,
    promptExamples,
    specifications: publication?.specifications || {},
    formats: [
      { name: "Paperback", status: "requires-publication-approval" },
      { name: "Digital edition", status: "requires-publication-approval" },
    ],
    pricing: { status: "executive-decision-required", value: null },
    isbn: { status: "publishing-decision-required", value: null },
    callsToAction: ["Get the book", "Start learning", "Build a clearer prompting system"],
    faq: [
      { question: "Is this book for complete beginners?", answer: "Yes. The material begins with plain-language foundations and builds toward reusable workflows." },
      { question: "Does the book require one specific AI platform?", answer: "No. It emphasizes durable prompting principles that remain useful as individual tools and interfaces change." },
      { question: "Does the book guarantee perfect AI responses?", answer: "No. It teaches clearer communication, iteration, verification, and responsible human judgment." },
      { question: "Which formats are available?", answer: "Only formats approved and activated on the product page should be presented as available for purchase." },
    ],
    seo: {
      title: truncate(title + " | Mindset Media Group", 60),
      metaDescription,
      altText: title + " book cover by " + (publication?.author || "Michael King"),
    },
    marketing: {
      announcement: title + " turns a confusing subject into a practical beginner system.",
      emailSubject: "A clearer way to begin with " + topic,
      launchCaption: shortDescription,
      tiktokConcepts: [
        "Show a weak prompt and transform it step by step.",
        "Teach the four parts of a useful prompt.",
        "Explain why better context creates better output.",
        "Demonstrate a reusable prompt template.",
        "Show the book and invite beginners to start with one practical chapter.",
      ],
    },
  };
  product.shopifyHTML = buildShopifyProductHTML(product);
  return product;
}

export function buildShopifyProductHTML(product) {
  const benefits = product.benefits.map(item => "<li>" + escapeHTML(item) + "</li>").join("");
  const chapters = product.insideTheBook.map((item, index) => "<li><span>" + String(index + 1).padStart(2, "0") + "</span>" + escapeHTML(item) + "</li>").join("");
  const faq = product.faq.map(item => "<details><summary>" + escapeHTML(item.question) + "</summary><p>" + escapeHTML(item.answer) + "</p></details>").join("");
  const examples = product.promptExamples.map(item => "<article><div><b>Before</b><p>" + escapeHTML(item.before) + "</p></div><div><b>Improved prompt</b><p>" + escapeHTML(item.after) + "</p></div></article>").join("");
  return [
    '<div class="mmg-book-product">',
    '<section class="mmg-book-intro"><p class="mmg-eyebrow">Mindset Media Group</p><h2>', escapeHTML(product.valueProposition), '</h2><p>', escapeHTML(product.shortDescription), '</p></section>',
    '<section><h3>What you will learn</h3><ul class="mmg-benefits">', benefits, '</ul></section>',
    examples ? '<section><h3>From vague request to useful prompt</h3><div class="mmg-examples">' + examples + '</div></section>' : '',
    '<section><h3>Inside the book</h3><ol class="mmg-chapters">', chapters, '</ol></section>',
    '<section><h3>Frequently asked questions</h3><div class="mmg-faq">', faq, '</div></section>',
    '<section class="mmg-book-final"><h3>Your knowledge has value.</h3><p>Build the clarity and practical system to use it well.</p></section>',
    '<style>.mmg-book-product{--ink:#07131d;--blue:#0b8fd3;--line:#dbe5ea;color:var(--ink);font:16px/1.65 Arial,sans-serif}.mmg-book-product section{padding:42px 0;border-bottom:1px solid var(--line)}.mmg-book-product h2{max-width:780px;font-size:clamp(36px,6vw,68px);line-height:1;letter-spacing:-.05em}.mmg-book-product h3{font-size:30px}.mmg-eyebrow{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.mmg-benefits,.mmg-chapters{display:grid;gap:12px;padding:0;list-style:none}.mmg-benefits li,.mmg-chapters li,.mmg-examples article,.mmg-faq details{padding:18px;border:1px solid var(--line);border-radius:16px}.mmg-chapters span{margin-right:14px;color:var(--blue);font-weight:800}.mmg-examples{display:grid;gap:16px}.mmg-examples article{display:grid;grid-template-columns:1fr 1fr;gap:18px}.mmg-examples b{color:var(--blue)}.mmg-faq{display:grid;gap:10px}.mmg-faq summary{cursor:pointer;font-weight:800}.mmg-book-final{padding:55px 28px!important;border:0!important;border-radius:24px;background:var(--ink);color:#fff;text-align:center}@media(max-width:680px){.mmg-examples article{grid-template-columns:1fr}}</style>',
    '</div>',
  ].join("");
}

export function buildProductAssetSVG(name, publication, product, coverFilename) {
  if (!PRODUCT_ASSET_NAMES.includes(name)) throw Object.assign(new Error("Unknown product asset."), { status: 404, code: "product_asset_not_found" });
  const portrait = name === "social-portrait.svg";
  const story = name === "social-story.svg";
  const width = portrait || story ? 1080 : 1600;
  const height = story ? 1920 : portrait ? 1350 : 1600;
  const copy = assetCopy(name, product);
  const coverWidth = story ? 500 : portrait ? 410 : 590;
  const coverHeight = Math.round(coverWidth * 1.5);
  const coverX = story ? 290 : portrait ? 600 : 880;
  const coverY = story ? 150 : portrait ? 160 : 250;
  const textX = story ? 90 : 100;
  const textWidth = story ? 900 : portrait ? 470 : 680;
  const titleLines = wrap(copy.title, story ? 20 : 24).slice(0, 4);
  const bodyLines = wrap(copy.body, story ? 38 : 48).slice(0, 6);
  const bulletLines = copy.bullets.slice(0, story ? 4 : 5);
  const titleMarkup = titleLines.map((line, index) => '<text x="' + textX + '" y="' + (story ? 1020 + index * 100 : 290 + index * 100) + '" class="title">' + escapeXML(line) + '</text>').join("");
  const bodyStart = story ? 1440 : 760;
  const bodyMarkup = bodyLines.map((line, index) => '<text x="' + textX + '" y="' + (bodyStart + index * 46) + '" class="body">' + escapeXML(line) + '</text>').join("");
  const bulletStart = story ? 1610 : 1040;
  const bulletMarkup = bulletLines.map((line, index) => '<text x="' + textX + '" y="' + (bulletStart + index * 58) + '" class="bullet">✓ ' + escapeXML(line) + '</text>').join("");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="', width, '" height="', height, '" viewBox="0 0 ', width, ' ', height, '" role="img" aria-label="', escapeXML(copy.title), '">',
    '<defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#04111c"/><stop offset=".6" stop-color="#082941"/><stop offset="1" stop-color="#0a6d9e"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="26" stdDeviation="22" flood-opacity=".42"/></filter></defs>',
    '<rect width="100%" height="100%" rx="0" fill="url(#bg)"/><circle cx="', width - 80, '" cy="80" r="460" fill="#3bd7ff" opacity=".08"/>',
    '<text x="', textX, '" y="110" class="kicker">MINDSET MEDIA GROUP</text>',
    '<image href="', escapeXML(coverFilename), '" x="', coverX, '" y="', coverY, '" width="', coverWidth, '" height="', coverHeight, '" preserveAspectRatio="xMidYMid meet" filter="url(#shadow)"/>',
    titleMarkup, bodyMarkup, bulletMarkup,
    '<text x="', textX, '" y="', height - 80, '" class="footer">YOUR KNOWLEDGE HAS VALUE.</text>',
    '<style>.kicker{fill:#73ddff;font:800 25px Arial,sans-serif;letter-spacing:7px}.title{fill:#fff;font:800 78px Arial,sans-serif;letter-spacing:-3px}.body{fill:#bbd0dc;font:400 29px Arial,sans-serif}.bullet{fill:#e7f8ff;font:700 27px Arial,sans-serif}.footer{fill:#73ddff;font:800 21px Arial,sans-serif;letter-spacing:5px}</style>',
    '</svg>',
  ].join("");
}

function assetCopy(name, product) {
  if (name === "product-hero.svg" || name === "social-square.svg" || name === "social-portrait.svg" || name === "social-story.svg") return {
    title: product.title,
    body: product.shortDescription,
    bullets: product.benefits.slice(0, 3),
  };
  if (name === "book-mockup.svg") return {
    title: "A practical guide you can use.",
    body: "Clear explanations. Useful examples. Repeatable systems.",
    bullets: ["Beginner-friendly", "Action-focused", "Built for real work"],
  };
  if (name === "what-youll-learn.svg") return { title: "What you’ll learn", body: product.valueProposition, bullets: product.whatYouWillLearn };
  if (name === "who-this-book-is-for.svg") return { title: "Who this book is for", body: product.targetReader, bullets: ["First-time users", "Creators and entrepreneurs", "Everyday builders"] };
  if (name === "inside-the-book.svg") return { title: "Inside the book", body: "A complete progression from foundations to repeatable practice.", bullets: product.insideTheBook.slice(0, 5) };
  return { title: "The beginner prompt framework", body: "Goal + context + constraints + output + verification.", bullets: ["Define the outcome", "Supply useful context", "Set the boundaries", "Request the format", "Review and improve"] };
}

function wrap(value, max) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > max) { lines.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

function slug(value) {
  return String(value || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "book";
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
}

function escapeXML(value) {
  return String(value == null ? "" : value).replace(/[<>&"']/g, character => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" })[character]);
}

