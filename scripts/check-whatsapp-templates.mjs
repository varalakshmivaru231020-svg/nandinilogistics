/**
 * The WhatsApp template rules that actually get a submission rejected.
 *
 * Meta's reviewer does not tell you which rule you broke — it says "rejected"
 * and you wait again — so every one of these is checked here before anything
 * is submitted. The rules are Cloud API's own, as at the 2026 template
 * guidelines: name shape, category, variable placement, sample completeness,
 * and the length caps on each component.
 */
import { readFileSync } from "node:fs";

const file = new URL("../docs/whatsapp-templates.json", import.meta.url);
const templates = JSON.parse(readFileSync(file, "utf8"));

const problems = [];
const fail = (name, why) => problems.push(`${name}: ${why}`);

for (const t of templates) {
  // A name is lowercase letters, digits and underscores, and nothing else.
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) fail(t.name, "the name must be lowercase a-z, 0-9 and _");
  if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(t.category)) {
    fail(t.name, `unknown category ${t.category}`);
  }
  if (!t.language) fail(t.name, "no language");

  const body = t.components.find((c) => c.type === "BODY");
  const footer = t.components.find((c) => c.type === "FOOTER");
  const header = t.components.find((c) => c.type === "HEADER");
  const buttons = t.components.find((c) => c.type === "BUTTONS");

  if (!body) {
    fail(t.name, "no body");
    continue;
  }

  const text = body.text;
  if (text.length > 1024) fail(t.name, `body is ${text.length} characters, over 1024`);
  if (footer && footer.text.length > 60) fail(t.name, "footer is over 60 characters");
  if (footer && /\{\{\d+\}\}/.test(footer.text)) fail(t.name, "a footer may not carry a variable");
  if (header && (header.text ?? "").length > 60) fail(t.name, "header is over 60 characters");

  // The two placement rules, which are the commonest rejection of the lot.
  if (/^\s*\{\{\d+\}\}/.test(text)) fail(t.name, "the body begins with a variable");
  if (/\{\{\d+\}\}\s*$/.test(text)) fail(t.name, "the body ends with a variable");
  if (/\}\}\s*\{\{/.test(text)) fail(t.name, "two variables sit next to each other");

  // Every variable needs a sample, and the numbering runs 1..n with no gaps.
  const used = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const highest = used.length ? Math.max(...used) : 0;
  const expected = Array.from({ length: highest }, (_, i) => i + 1);
  for (const n of expected) {
    if (!used.includes(n)) fail(t.name, `{{${n}}} is skipped — numbering must run 1..${highest}`);
  }
  const samples = body.example?.body_text?.[0] ?? [];
  if (samples.length !== highest) {
    fail(t.name, `${highest} variables but ${samples.length} sample values`);
  }
  for (const [i, s] of samples.entries()) {
    if (!String(s).trim()) fail(t.name, `sample ${i + 1} is empty`);
    if (/\{\{|lorem|sample|xxx|test/i.test(String(s))) {
      fail(t.name, `sample ${i + 1} reads as placeholder text: "${s}"`);
    }
  }

  for (const b of buttons?.buttons ?? []) {
    if (b.text.length > 25) fail(t.name, `button "${b.text}" is over 25 characters`);
    if (b.type === "URL") {
      if (!/^https:\/\//.test(b.url)) fail(t.name, "a button url must be https");
      // A dynamic suffix needs an example url, or the template is rejected.
      if (/\{\{1\}\}/.test(b.url) && !b.example?.length) {
        fail(t.name, "a url with a variable needs an example url");
      }
    }
  }

  /*
   * Utility means an account update or something the person's own action
   * caused. A word of selling in it and Meta recategorises the template as
   * marketing — which costs more, needs opt-in, and can be throttled.
   */
  if (t.category === "UTILITY") {
    const selling = /\b(offer|discount|deal|limited time|book now|hurry|exclusive|free|sale)\b/i;
    if (selling.test(text)) fail(t.name, "this reads as marketing, not utility");
  }
}

const names = templates.map((t) => t.name);
if (new Set(names).size !== names.length) problems.push("two templates share a name");

console.log(`${templates.length} templates checked`);
if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log("  every one passes the rules that get a submission rejected");
