import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DIGITAL_ASSET_V2_LABEL, MINIMUM_FINISHED_PAGES, customerReleaseNames } from "./kairos-digital-asset-edition-v2-contract-v1.js";

export const KAIROS_DIGITAL_ASSET_V2_CUSTOMER_DOCS_BUILD = "kairos-digital-asset-v2-customer-docs-20260723-1";

const PUBLISHER = "Mindset Media Group™";
const VERSION = "2.0";

export async function buildCustomerSpecSheetPDFV2(publication, names = customerReleaseNames(publication)) {
  const title = clean(publication?.title || "Untitled Digital Guide");
  const subtitle = clean(publication?.subtitle || "");
  const wordCount = Number(publication?.wordCount || 0);
  const finishedPages = Number(publication?.pageCount || Math.ceil(wordCount / 250));
  const developedSections = Array.isArray(publication?.chapters) ? publication.chapters.length : 0;
  const readingHours = Math.max(1, Math.ceil(wordCount / 13_200));
  const releaseDate = clean(publication?.releaseDate || new Date().toISOString().slice(0, 10));
  const profile = subjectProfile(title);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  let page;
  let y;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 52;
    page.drawText(PUBLISHER.toUpperCase(), { x: margin, y, size: 9, font: bold, color: rgb(0.02, 0.48, 0.72) });
    y -= 26;
  };
  const ensure = (height = 50) => { if (y < margin + height) newPage(); };
  const heading = (text, size = 15) => {
    ensure(size + 24);
    page.drawText(text, { x: margin, y, size, font: bold, color: rgb(0.02, 0.20, 0.32), maxWidth: contentWidth });
    y -= size + 10;
  };
  const paragraph = (text, options = {}) => {
    const size = options.size || 10.25;
    const lineHeight = options.lineHeight || 14.2;
    for (const line of wrap(clean(text), regular, size, contentWidth)) {
      ensure(lineHeight + 4);
      page.drawText(line, { x: margin, y, size, font: regular, color: rgb(0.08, 0.09, 0.11) });
      y -= lineHeight;
    }
    y -= options.after == null ? 7 : options.after;
  };
  const bullet = (text) => paragraph(`- ${text}`, { after: 2 });
  const labelValue = (label, value) => {
    ensure(26);
    page.drawText(`${label}:`, { x: margin, y, size: 10.2, font: bold, color: rgb(0.02, 0.20, 0.32) });
    page.drawText(clean(value), { x: margin + 136, y, size: 10.2, font: regular, color: rgb(0.08, 0.09, 0.11), maxWidth: contentWidth - 136 });
    y -= 18;
  };

  newPage();
  page.drawText(title, { x: margin, y, size: 25, font: bold, color: rgb(0.02, 0.08, 0.13), maxWidth: contentWidth });
  y -= 36;
  if (subtitle) paragraph(subtitle, { size: 11.5, lineHeight: 15.5, after: 12 });
  page.drawText("Customer Product Specification", { x: margin, y, size: 16, font: bold, color: rgb(0.02, 0.48, 0.72) });
  y -= 30;

  heading("Product Identity");
  labelValue("Edition", DIGITAL_ASSET_V2_LABEL);
  labelValue("Version", VERSION);
  labelValue("Publisher", PUBLISHER);
  labelValue("Release date", releaseDate);
  labelValue("Finished length", `${finishedPages} pages`);
  labelValue("Developed sections", String(developedSections));
  labelValue("Estimated reading time", `${readingHours}-${readingHours + 2} hours, depending on exercises and implementation`);
  y -= 4;

  heading("About the Book");
  paragraph(profile.summary);

  heading("What You Will Learn");
  for (const outcome of profile.outcomes) bullet(outcome);

  heading("Who This Book Is For");
  paragraph(profile.audience);

  heading("What You Receive");
  bullet(`${names.digitalEdition} - the primary screen-reading edition with the approved cover as page one.`);
  bullet(`${names.kdpInterior} - a cover-free 6 x 9-inch interior prepared for compatible print workflows.`);
  bullet(`${names.portraitCover} - a 2048 x 3072-pixel portrait cover image.`);
  bullet(`${names.thumbnailCover} - a 2048 x 2048-pixel square thumbnail with the full portrait cover preserved.`);
  bullet(`${names.readme} - package contents and file-use instructions.`);
  bullet(`${names.specSheet} - this customer product specification.`);

  heading("How to Use the Package");
  bullet("Use the Digital Edition for reading, study, prompt development, and direct implementation.");
  bullet("Use the KDP Interior only for a compatible 6 x 9-inch print-interior workflow; it intentionally excludes the front cover.");
  bullet("Use the portrait cover for tall product displays, digital libraries, and portrait-format presentation.");
  bullet("Use the square thumbnail where a 1:1 marketplace, library, or catalog image is required.");
  bullet("Preserve the original filenames so every edition and image remains clearly identified.");

  heading("Technical Specifications");
  bullet(`Digital Edition PDF: ${finishedPages >= MINIMUM_FINISHED_PAGES ? finishedPages : MINIMUM_FINISHED_PAGES}+ substantive pages, approved cover on page one, selectable text.`);
  bullet("KDP Interior PDF: 6 x 9 inches, black-and-white interior, cover-free, print-safe page geometry.");
  bullet("Portrait cover: PNG, RGB/RGBA, 2048 x 3072 pixels, 2:3 aspect ratio, no cropping or redrawing.");
  bullet("Square thumbnail: PNG, RGB/RGBA, 2048 x 2048 pixels, full portrait cover visible with intentional background accommodation.");
  bullet("Customer files contain no individual author attribution or internal production instructions.");

  heading("Customer Use Notice");
  paragraph("This coordinated publication package is provided for reading, implementation, archiving, and compatible publishing workflows. Third-party platforms may apply their own upload, trim, color, file-size, and acceptance requirements. Review those requirements before submission.");

  pdf.setTitle(`${title} - Customer Product Specification`);
  pdf.setSubject(DIGITAL_ASSET_V2_LABEL);
  pdf.setAuthor(PUBLISHER);
  pdf.setCreator(PUBLISHER);
  pdf.setProducer(PUBLISHER);
  return pdf.save();
}

export function buildCustomerREADMEV2(publication, names = customerReleaseNames(publication)) {
  const title = clean(publication?.title || "Untitled Digital Guide");
  const wordCount = Number(publication?.wordCount || 0);
  const finishedPages = Number(publication?.pageCount || Math.ceil(wordCount / 250));
  const developedSections = Array.isArray(publication?.chapters) ? publication.chapters.length : 0;
  const releaseDate = clean(publication?.releaseDate || new Date().toISOString().slice(0, 10));

  const text = [
    title,
    DIGITAL_ASSET_V2_LABEL,
    `Version ${VERSION}`,
    `Release date: ${releaseDate}`,
    `Published by ${PUBLISHER}`,
    "",
    "PACKAGE CONTENTS",
    `1. ${names.specSheet}`,
    `2. ${names.kdpInterior}`,
    `3. ${names.digitalEdition}`,
    `4. ${names.portraitCover}`,
    `5. ${names.thumbnailCover}`,
    `6. ${names.readme}`,
    "",
    "FILE GUIDE",
    `- ${names.digitalEdition}: Primary customer reading edition. The approved front cover is page one.`,
    `- ${names.kdpInterior}: Cover-free 6 x 9-inch print interior. Do not treat this file as a complete cover-and-interior upload.`,
    `- ${names.portraitCover}: 2048 x 3072-pixel portrait PNG for tall-format presentation.`,
    `- ${names.thumbnailCover}: 2048 x 2048-pixel square PNG with the complete portrait cover preserved.`,
    `- ${names.specSheet}: Customer product details, learning outcomes, audience, use instructions, and technical specifications.`,
    "",
    "EDITION DETAILS",
    `- Finished pages: ${finishedPages}`,
    `- Developed sections: ${developedSections}`,
    `- Publisher and creator identity: ${PUBLISHER}`,
    "",
    "DELIVERY NOTES",
    "Keep all six files together and preserve their original filenames. Review the requirements of any third-party publishing platform before upload. The Digital Edition and KDP Interior serve different purposes and should not be substituted for one another.",
    "",
  ].join("\n");
  return new TextEncoder().encode(text);
}

function subjectProfile(title) {
  if (/ai\s+image/i.test(title)) {
    return {
      summary: "AI Image Mastery is a practical field guide to directing AI image systems with professional visual language. It develops the reader's ability to design structured prompts, control lighting and composition, improve realism and consistency, build repeatable visual workflows, and apply those systems to branding, advertising, content creation, product imagery, thumbnails, characters, and commercial projects.",
      audience: "Creators, entrepreneurs, marketers, designers, freelancers, small-business owners, content teams, and beginners who want a disciplined system for producing stronger AI-generated visuals without relying on random prompting.",
      outcomes: [
        "Translate a visual concept into a structured professional prompt.",
        "Control subject, environment, lighting, camera direction, composition, mood, color, materials, and realism.",
        "Diagnose weak generations and repair prompts through deliberate iteration.",
        "Build reusable prompt frameworks, style systems, checklists, and production workflows.",
        "Create more consistent assets for branding, advertising, product presentation, social media, thumbnails, fashion, storytelling, and client work.",
        "Apply responsible decision rules for rights, representation, disclosure, and professional use.",
      ],
    };
  }
  return {
    summary: `${title} is a substantial customer operating manual designed to convert the subject into clear principles, repeatable frameworks, implementation workflows, practical tools, and direct action steps.`,
    audience: "Readers, creators, entrepreneurs, and professionals who want a structured system they can study, apply, and reuse.",
    outcomes: [
      "Understand the central principles and terminology of the subject.",
      "Apply a repeatable framework instead of relying on disconnected tactics.",
      "Use practical templates, worksheets, checklists, and decision rules.",
      "Diagnose common failure patterns and improve implementation quality.",
      "Convert the material into a durable personal or professional workflow.",
    ],
  };
}

function wrap(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function clean(value) {
  return String(value == null ? "" : value)
    .replace(/Michael\s+King/gi, PUBLISHER)
    .replace(/\bKairos\b/gi, "the production system")
    .replace(/\bShopify\b/gi, "the customer platform")
    .replace(/[\u2013\u2014]/g, "-")
    .trim();
}
