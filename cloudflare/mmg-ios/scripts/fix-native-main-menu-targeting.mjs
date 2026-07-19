import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/kairos-native-main-menu-publisher-20260718.js', import.meta.url);
let source = await readFile(file, 'utf8');

const replacements = [
  [
    'export const KAIROS_NATIVE_MAIN_MENU_BUILD = "kairos-native-main-menu-publisher-20260718-7";',
    'export const KAIROS_NATIVE_MAIN_MENU_BUILD = "kairos-native-main-menu-publisher-20260718-8";'
  ],
  [
    'updatedMenus.push({ id: updated.id, handle: updated.handle, title: updated.title, before, after, legacyScore: legacyScore(menu), bound: boundHandles.has(menu.handle) });',
    'updatedMenus.push({ id: updated.id, handle: updated.handle, title: updated.title, before, after, legacyScore: legacyScore(menu), bound: boundHandles.has(menu.handle), authoritative: menu.handle === "main-menu" || boundHandles.has(menu.handle) });'
  ],
  [
    'boundMenuUpdated: updatedMenus.some(m => m.bound),',
    'boundMenuUpdated: updatedMenus.some(m => m.bound),\n      primaryMainMenuUpdated: updatedMenus.some(m => m.handle === "main-menu"),\n      authoritativeMenuUpdated: updatedMenus.some(m => m.authoritative),'
  ],
  [
    'function selectTargetMenus(menus, handles) {\n  const selected = [];\n  const seen = new Set();\n  const add = m => { if (m?.id && !seen.has(m.id)) { seen.add(m.id); selected.push(m); } };\n  menus.filter(m => handles.has(m.handle)).forEach(add);\n  menus.filter(m => legacyScore(m) >= 3).sort((a, b) => legacyScore(b) - legacyScore(a)).forEach(add);\n  menus.filter(m => m.handle === "main-menu" || m.isDefault || /main/i.test(m.title || "")).forEach(add);\n  return selected;\n}',
    'function selectTargetMenus(menus, handles) {\n  const selected = [];\n  const seen = new Set();\n  const add = m => { if (m?.id && !seen.has(m.id)) { seen.add(m.id); selected.push(m); } };\n\n  menus.filter(m => handles.has(m.handle)).forEach(add);\n\n  const primary = menus.find(m => m.handle === "main-menu");\n  if (primary) add(primary);\n\n  if (!selected.length) {\n    const legacy = [...menus].filter(m => legacyScore(m) >= 3).sort((a, b) => legacyScore(b) - legacyScore(a))[0];\n    if (legacy) add(legacy);\n  }\n\n  if (!selected.length) {\n    const fallback = menus.find(m => /main/i.test(m.title || "")) || menus.find(m => m.isDefault);\n    if (fallback) add(fallback);\n  }\n\n  return selected;\n}'
  ]
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) {
    throw new Error(`Native main-menu targeting patch could not find expected source:\n${before.slice(0, 160)}`);
  }
  source = source.replace(before, after);
}

if (!source.includes('kairos-native-main-menu-publisher-20260718-8')) throw new Error('Native main-menu build was not upgraded.');
if (!source.includes('primaryMainMenuUpdated')) throw new Error('Primary main-menu verification was not installed.');
if (!source.includes('const primary = menus.find(m => m.handle === "main-menu")')) throw new Error('Authoritative main-menu targeting was not installed.');

await writeFile(file, source, 'utf8');
console.log('Native Shopify targeting constrained to the authoritative main-menu.');
