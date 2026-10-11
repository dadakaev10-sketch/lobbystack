import { expect, test } from "@playwright/test";
import { createDatabaseClient } from "@lobbystack/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

test.use({ locale: "en-US" });
test("German default SSR and hydrated login, explicit English, and authenticated onboarding", async ({ page, context, request }, testInfo) => {
  const evidence = process.env.LOBBYSTACK_LOCALE_EVIDENCE_DIR ?? testInfo.outputPath("locale-evidence");
  mkdirSync(evidence, { recursive: true });
  const http = await request.get("/login", { headers: { "accept-language": "en-US,en;q=0.9" } });
  expect(http.ok()).toBe(true);
  const html = await http.text();
  expect(html).toContain('lang="de"');
  expect(html).toContain("Willkommen zurück");
  writeFileSync(`${evidence}/login-http.html`, html);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/de\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { name: "Willkommen zurück" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/login-de.png`, fullPage: true });
  await page.goto("/login?lng=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.screenshot({ path: `${evidence}/login-en.png`, fullPage: true });

  const email = `german-ui-${randomUUID()}@example.invalid`;
  const password = `Fixture-${randomUUID()}-1!`;
  const dbUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!dbUrl || !new URL(dbUrl).hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw new Error("Requires isolated localhost test database");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: dbUrl });
  try {
    const signup = await context.request.post("/api/auth/sign-up/email", { data: { email, password, name: "German UI fixture", preferredLocale: "de" }, headers: { origin: new URL(page.url()).origin } });
    expect(signup.ok(), await signup.text()).toBe(true);
    await database.db.execute(sql`update public.users set email_verified = true where email = ${email}`);
    const signin = await context.request.post("/api/auth/sign-in/email", { data: { email, password }, headers: { origin: new URL(page.url()).origin } });
    expect(signin.ok(), await signin.text()).toBe(true);
    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(cookies.filter(cookie => cookie.name !== "lobbystack.locale"));
    await page.evaluate(() => localStorage.removeItem("lobbystack.locale"));
    const onboardingHttp = await context.request.get("/onboarding/business");
    expect(onboardingHttp.ok()).toBe(true);
    const onboardingHtml = await onboardingHttp.text();
    expect(onboardingHtml).toContain('lang="de"');
    expect(onboardingHtml).toContain("Wie heißt Ihr Unternehmen?");
    writeFileSync(`${evidence}/onboarding-http.html`, onboardingHtml);
    await page.goto("/onboarding/business");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { name: "Erstens: Wie heißt Ihr Unternehmen?" })).toBeVisible();
    await expect(page.getByLabel("Unternehmensname")).toBeVisible();
    await page.screenshot({ path: `${evidence}/onboarding-de.png`, fullPage: true });
    await context.addCookies([{ name: "lobbystack.locale", value: "en", url: new URL(page.url()).origin }]);
    await page.goto("/onboarding/business");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "First, what is the name of your business?" })).toBeVisible();
    await page.screenshot({ path: `${evidence}/onboarding-en.png`, fullPage: true });
    writeFileSync(`${evidence}/browser-verification.json`, JSON.stringify({ browserLocale: "en-US", default: "de", explicitEnglish: true, englishCookiePreserved: true, authenticatedOnboarding: true, customerDatabaseTouched: false }, null, 2));
  } finally {
    await database.db.execute(sql`delete from public.outbox_messages where aggregate_id in (select id from public.users where email = ${email})`);
    await database.db.execute(sql`delete from public.users where email = ${email}`);
    await database.pool.end();
  }
});
