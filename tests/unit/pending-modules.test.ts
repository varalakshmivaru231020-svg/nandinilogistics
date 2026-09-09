import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Task and Checklist management are held pending client verification. Their
 * screens exist only as a picture of the approved design — see
 * docs/PENDING_MODULES.md. These tests fail the moment one of them quietly
 * grows a database read or a write path.
 */
const ROOT = join(__dirname, "..", "..");

const PENDING_PAGES = [
  "src/app/(app)/tasks/page.tsx",
  "src/app/(app)/checklists/page.tsx",
];

describe("pending module screens", () => {
  for (const rel of PENDING_PAGES) {
    describe(rel, () => {
      const source = readFileSync(join(ROOT, rel), "utf8");

      it("touches no database", () => {
        expect(source).not.toMatch(/from "@\/lib\/db"|prisma\./);
      });

      it("declares and calls no server action", () => {
        expect(source).not.toContain("use server");
        expect(source).not.toMatch(/Action\b/);
        expect(source).not.toMatch(/<form\b/);
      });

      it("guards on the registered view permission", () => {
        expect(source).toMatch(/requirePermission\(PERM\.\w+\.\w+\.view\)/);
      });

      it("says plainly that it is a preview", () => {
        expect(source).toContain("PendingModuleBanner");
      });

      it("leaves every control inert", () => {
        const buttons = source.match(/<(?:button|Button)\b[^>]*>/g) ?? [];
        expect(buttons.length).toBeGreaterThan(0);
        for (const tag of buttons) {
          expect(tag, `${tag} must be disabled`).toMatch(/\bdisabled\b/);
        }
      });
    });
  }
});
