/**
 * Writes docs/MOBILE_PARITY.md from the registries themselves.
 *
 * A matrix anybody types by hand is wrong within a week. This one is read out
 * of the things that decide the behaviour — the screen registry, the record
 * registry, the form registry, the generated action registry and the parity
 * exemptions — so it says what the code does rather than what somebody
 * remembered.
 *
 *   pnpm parity:matrix
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");

function read(dir: string, ext: string): string {
  let out = "";
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(ext)) out += readFileSync(path, "utf8");
    }
  };
  walk(dir);
  return out;
}

const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

/* ----------------------------------------------------------- the registries */

/** Each list screen with the web route it is, which the registry itself names. */
const screenSrc = src("src/lib/screens/registry.ts");
const screens = [...screenSrc.matchAll(/^  "?([a-z/\-]+)"?: \{\n    key: "([^"]+)",\n    href: "([^"]+)",/gm)].map(
  (m) => ({ key: m[2], href: m[3] }),
);
const records = [...src("src/lib/records/registry.ts").matchAll(/^  "?([a-z/\-]+)"?: \{\n    key:/gm)].map(
  (m) => m[1],
);
const forms = [...src("src/lib/forms/registry.ts").matchAll(/^  "([^"]+)": \{$/gm)].map((m) => m[1]);
const actions = [...src("src/lib/api/mobile-actions.ts").matchAll(/^  "([^"]+)": \{$/gm)].map(
  (m) => m[1],
);

const parity = [
  ...src("src/lib/api/parity.ts").matchAll(
    /"([^"]+)": \{\s*reason: "([a-z:-]+)",\s*note: "((?:[^"\\]|\\.)*)"/g,
  ),
].map((m) => ({ action: m[1], reason: m[2], note: m[3] }));

const SERVER = read(join(ROOT, "src", "lib", "records"), ".ts") +
  read(join(ROOT, "src", "lib", "forms"), ".ts");
const DART = read(join(ROOT, "mobile", "lib"), ".dart");
const reachable = (a: string) =>
  SERVER.includes(`"${a}"`) || DART.includes(`'${a}'`) || DART.includes(`"${a}"`);

/* ------------------------------------------------------------- the web pages */

/** Every page under the app's own route group, as its route. */
function webRoutes(): string[] {
  const base = join(ROOT, "src", "app", "(app)");
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === "page.tsx") {
        const route = "/" + relative(base, d).replace(/\\/g, "/");
        out.push(route === "/." ? "/" : route);
      }
    }
  };
  walk(base);
  return out.sort();
}

const routes = webRoutes();

/**
 * Where a module's documents come from, for the ones no list creates.
 *
 * Prose, because it is about intent — but short, and next to the generator so
 * it is read whenever the numbers are.
 */
/** Modules that are a report or a queue, so a record of their own is wrong. */
const REPORTS: Record<string, string> = {
  approvals: "a queue — each row opens the document it is about",
  "tasks/reports": "a report over tasks — there is nothing behind a row",
  "material/reorder": "a report over the item master; a row opens the item",
};

const CREATED_FROM: Record<string, string> = {
  "material/stock": "the item master, which is web-only",
  "material/issues": "the indent — “Issue from stock”",
  "material/returns": "the issue slip — “Raise return”",
  "material/grn": "the purchase order — “Receive goods”",
  "material/purchase-orders": "the indent — “Raise purchase order”",
  "material/invoices": "the purchase order — “Record vendor invoice”",
  "material/payments": "the invoice — “Record payment”",
  "material/reorder": "nothing: it is a report over the item master",
  "sales/follow-ups": "the lead — “Log follow-up”",
  "sales/site-visits": "the lead — “Schedule a site visit”",
  "sales/bookings": "the cost sheet — “Confirm booking”",
  "sales/receipts": "the booking's milestone — “Collect”",
  "sales/cost-sheets": "the flat — “Generate a cost sheet”",
  "tasks/reports": "nothing: it is a report",
};

/* ------------------------------------------------------------------ the table */

const tick = (ok: boolean) => (ok ? "✅" : "❌");

const rows = screens.map(({ key, href }) => {
  const record = records.includes(key);
  const create = forms.filter((f) => f.startsWith(`${key}:`) && !f.endsWith(":edit"));
  const edit = forms.includes(`${key}:edit`);
  const route = routes.includes(href) ? href : href;
  const from = CREATED_FROM[key];
  const report = REPORTS[key];
  const status = report
    ? "n/a"
    : record && (create.length > 0 || edit || from)
      ? "✅"
      : record
        ? "⚠️"
        : "❌";
  return { key, route, record, create, edit, status, from: report ?? from };
});

const unreachable = actions.filter((a) => !reachable(a));
const byReason = parity.reduce<Record<string, typeof parity>>((acc, p) => {
  (acc[p.reason] ??= []).push(p);
  return acc;
}, {});

const doc = `# Web → mobile parity

**Generated — do not hand-edit.** \`pnpm parity:matrix\` writes this file from
the registries that decide the behaviour: \`src/lib/screens/registry.ts\`,
\`src/lib/records/registry.ts\`, \`src/lib/forms/registry.ts\`, the generated
\`src/lib/api/mobile-actions.ts\` and the exemptions in
\`src/lib/api/parity.ts\`. \`tests/unit/mobile-parity.test.ts\` fails if an
action is unreachable from the app and unexplained.

Last written ${new Date().toISOString().slice(0, 10)}.

## In one line

| | |
|---|---|
| Web actions on the boundary | **${actions.length}** |
| Reachable from the app | **${actions.length - unreachable.length}** |
| Not reachable, with a reason | ${unreachable.length} |
| Web list screens | ${screens.length} |
| …with a record screen | ${rows.filter((r) => r.record).length} |
| …with a create form | ${rows.filter((r) => r.create.length > 0).length} |
| …with an edit form | ${rows.filter((r) => r.edit).length} |

## The modules

Every list the web has, against the phone. A module is ✅ when its rows open a
record **and** something can be made or changed from it — which includes the
documents raised from another record, since that is where the web raises them
too. **n/a** is a report or a queue, where a record of its own would be wrong.
The last column says where each one is raised.

| Web module | Web route | Record | Create | Edit | | Where it is raised |
|---|---|---|---|---|---|---|
${rows
  .map(
    (r) =>
      `| \`${r.key}\` | \`${r.route}\` | ${tick(r.record)} | ${
        r.create.length ? r.create.map((c) => `\`${c.split(":")[1]}\``).join(", ") : "—"
      } | ${r.edit ? "✅" : "—"} | ${r.status} | ${r.from ?? "its own list"} |`,
  )
  .join("\n")}

## The actions the phone cannot reach

${Object.entries(byReason)
  .map(
    ([reason, list]) =>
      `### ${reason} — ${list.length}\n\n${list
        .map((p) => `- \`${p.action}\` — ${p.note}`)
        .join("\n")}`,
  )
  .join("\n\n")}

## Every screen's states

| State | Where it comes from |
|---|---|
| Loading | a spinner on the list, the record, the form and the notifications |
| Empty | the list's own \`emptyMessage\` from the server, in the web's words |
| Error | the server's sentence verbatim, with its code — "Refused by …" — and a retry, except on a refusal, which no retry can fix |
| Success | the action's \`done\` line, as a snackbar, naming what happened |
| Refresh | pull-to-refresh on the notifications, a Reload control on the bar elsewhere |
| Nothing chosen | a module needing a project says \`project-required\` and the screen offers the chooser |

## What is deliberately not mirrored

- **Sorting.** The web has none: its \`DataTable\` renders the order the query
  returns and no column is sortable. There is nothing to mirror.
- **Bulk selection.** Three task actions are bulk controls on the web's list,
  which takes the selected rows. The phone offers each for the task in front of
  it; selecting several rows would be a design addition, and the artboards have
  no selection state.
- **Exports.** Reading a list on the phone deliberately does not require the
  \`.export\` permission and does not produce a file; a CSV on a handset is not
  a thing anybody asked for. The permission still gates the web's own menu.
- **Printing.** \`/print/*\` is a browser view. Nothing on the phone opens one.

## Where the web itself is asymmetric

Found while auditing, and worth a decision rather than a silent choice:

- \`updateTaskAction\` and \`updateCalendarTaskAction\` exist and are enforced
  by rules the lifecycle models — the Assigner may correct a task until work
  starts — and **no web screen calls either**. The phone offers both.
- Five schedule actions have no web screen at all: applying, saving and
  deleting a template, and adding or removing a dependency. The phone draws an
  activity's links read-only and offers none of the five.
- The web's PO form carries other charges, a line discount, a specification and
  a line's GST and draws none of them. The phone carries all four hidden so an
  edit cannot clear them.
`;

writeFileSync(join(ROOT, "docs", "MOBILE_PARITY.md"), doc);
console.log(
  `docs/MOBILE_PARITY.md — ${actions.length - unreachable.length}/${actions.length} actions, ` +
    `${rows.filter((r) => r.record).length}/${screens.length} modules with a record`,
);
