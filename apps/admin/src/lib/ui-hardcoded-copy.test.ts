import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("localizes account and analytics failure/loading states", () => {
  for (const [file, strings] of [
    ["live-account-surface.tsx", ["Loading account...", "Account data is unavailable."]],
    ["live-analytics-surface.tsx", ["Analytics are unavailable."]],
    ["ui/sidebar.tsx", ["Sidebar", "Displays the mobile sidebar."]],
  ] as const) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8");
    for (const text of strings) expect(source).not.toContain(`>${text}<`);
  }
});
