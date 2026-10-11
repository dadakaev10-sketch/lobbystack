import { expect, it } from "vitest";
import { negotiateLocale } from "./locale-request";
import { localeResources } from "./i18n-resources";

it("defaults to German regardless of browser language while preserving explicit preferences", () => {
  expect(negotiateLocale({ acceptLanguage: "en-US,en;q=0.9" })).toEqual({ locale: "de", source: "default" });
  expect(negotiateLocale({ query: "invalid", cookie: "invalid", acceptLanguage: "fr" })).toEqual({ locale: "de", source: "default" });
  expect(negotiateLocale({ cookie: "en", acceptLanguage: "de" })).toEqual({ locale: "en", source: "cookie" });
  expect(negotiateLocale({ query: "de", cookie: "en" })).toEqual({ locale: "de", source: "query" });
});

it("ships complete German SSR resources with exact English keys and placeholders", () => {
  const flatten = (value: unknown, prefix = ""): Record<string, string> => typeof value === "string" ? { [prefix]: value } : Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => Object.entries(flatten(child, `${prefix}.${key}`))));
  const german = (localeResources as Record<string, Record<string, unknown>>).de;
  expect(german).toBeDefined();
  expect(Object.keys(german!).sort()).toEqual(Object.keys(localeResources.en).sort());
  for (const [namespace, bundle] of Object.entries(localeResources.en)) {
    const en = flatten(bundle);
    const de = flatten(german![namespace]);
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(en)) {
      const tokens = (text: string) => [...text.matchAll(/\{\{[^}]+\}\}|<\/?[^>]+>/g)].map(match => match[0]).sort();
      expect(tokens(de[key]!), `${namespace}:${key}`).toEqual(tokens(value));
    }
  }
});
