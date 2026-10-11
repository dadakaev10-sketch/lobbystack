import { describe, expect, it } from "vitest";
import { startupEmbeddingBusinesses } from "./embeddingStartup";
describe("startup embedding authorization", () => {
  it("does not reindex any customer by default", () => {
    expect(startupEmbeddingBusinesses(["a", "b"], {})).toEqual([]);
  });
  it("only selects explicitly authorized existing canary businesses", () => {
    expect(startupEmbeddingBusinesses(["a", "b"], { AI_EMBEDDING_STARTUP_BUSINESS_IDS: "b,unknown,b" })).toEqual(["b"]);
    expect(startupEmbeddingBusinesses(["a", "b"], { AI_EMBEDDING_STARTUP_BUSINESS_IDS: "*" })).toEqual([]);
  });
});
