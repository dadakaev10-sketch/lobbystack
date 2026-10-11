// Provider configuration alone is never authorization to mutate customer indexes.
export function startupEmbeddingBusinesses(businessIds: string[], env: Record<string, string | undefined>): string[] {
  const authorized = new Set((env.AI_EMBEDDING_STARTUP_BUSINESS_IDS ?? "").split(",").map(id => id.trim()).filter(id => id && id !== "*"));
  return [...new Set(businessIds)].filter(id => authorized.has(id));
}
