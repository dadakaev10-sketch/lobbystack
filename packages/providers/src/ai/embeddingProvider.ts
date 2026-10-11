import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, type EmbeddingModel } from "ai";
import { createHash } from "node:crypto";

import { trimTrailingSlashes, type AiUsage } from "@lobbystack/shared";

export const DEFAULT_EMBEDDING_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_AI_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
export const DEFAULT_EMBEDDING_MAX_PARALLEL_CALLS = 4;

export type EmbeddingAiConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  name?: string;
  inputCostPerMillionTokens?: number;
  revision?: string;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  timeoutMs?: number;
  maxParallelCalls?: number;
  maxBatchSize?: number;
};

export type EmbeddingOptions = {
  abortSignal?: AbortSignal;
};

export class OpenAiCompatibleEmbeddingProvider {
  private readonly config: EmbeddingAiConfig;
  private readonly model: string;
  private readonly api: EmbeddingModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number | undefined;
  private readonly pricingVersion: string | undefined;
  private readonly pricingSource: string | undefined;
  private readonly pricingEffectiveDate: string | undefined;
  private readonly embeddingFingerprint: string;
  private readonly timeoutMs: number;
  private readonly maxParallelCalls: number;
  private readonly maxBatchSize: number;

  constructor(config: EmbeddingAiConfig) {
    this.config = { ...config };
    this.model = config.model ?? DEFAULT_EMBEDDING_AI_MODEL;
    this.providerName = config.name ?? "openai";
    const baseURL = (config.baseURL ?? DEFAULT_EMBEDDING_AI_BASE_URL).replace(/\/$/, "");
    const factory = createOpenAICompatible({
      name: this.providerName,
      baseURL,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
    this.api = factory.embeddingModel(this.model);
    // Do not attach an unauditable price to financial usage records.
    this.inputCostPerMillionTokens = hasVersionedPricing(config) ? config.inputCostPerMillionTokens : undefined;
    this.pricingVersion = config.pricingVersion;
    this.pricingSource = config.pricingSource;
    this.pricingEffectiveDate = config.pricingEffectiveDate;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS;
    this.maxParallelCalls = config.maxParallelCalls ?? DEFAULT_EMBEDDING_MAX_PARALLEL_CALLS;
    if (!Number.isInteger(this.maxParallelCalls) || this.maxParallelCalls < 1) {
      throw new Error("Embedding max parallel calls must be a positive integer.");
    }
    this.maxBatchSize = config.maxBatchSize ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(this.maxBatchSize) || this.maxBatchSize < 1) {
      throw new Error("Embedding max batch size must be a positive safe integer.");
    }
    this.embeddingFingerprint = createEmbeddingFingerprint({
      baseURL,
      model: this.model,
      providerName: this.providerName,
      revision: config.revision ?? "1",
    });
  }

  get fingerprint(): string {
    return this.embeddingFingerprint;
  }

  /** Use the inference service's exact pinned tokenizer, never truncate source text. */
  async prepareChunks(values: string[]): Promise<string[]> {
    if (this.model !== "gte-local") return values;
    const revision = "a9af15a6372d7d6b25e9fb07c2ccb9e1fe645644";
    if (!this.config.revision?.startsWith(`${revision}-`)) throw new Error("Local tokenizer revision must be pinned.");
    const chunks: string[] = [];
    // One existing character chunk per bounded request, independent of inference batches.
    for (const value of values) {
      const response = await fetch(`${(this.config.baseURL ?? DEFAULT_EMBEDDING_AI_BASE_URL).replace(/\/$/, "")}/chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, input: [value] }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`Local tokenizer request failed (${response.status}).`);
      const result = await response.json() as { chunks?: unknown; revision?: string; max_tokens?: number };
      const groups = result.chunks;
      if (result.revision !== revision || result.max_tokens !== 512 || !Array.isArray(groups) || groups.length !== 1 || !Array.isArray(groups[0]) || !groups[0].length || groups[0].some((chunk: unknown) => typeof chunk !== "string" || !chunk.length) || groups[0].join("") !== value) {
        throw new Error("Local tokenizer returned an incompatible or lossy chunk result.");
      }
      chunks.push(...groups[0] as string[]);
    }
    return chunks;
  }

  async embed(values: string[], onUsage?: (usage: AiUsage) => Promise<void> | void, options?: EmbeddingOptions): Promise<number[][]> {
    if (values.length > this.maxBatchSize) {
      const vectors: number[][] = [];
      for (let offset = 0; offset < values.length; offset += this.maxBatchSize) {
        vectors.push(...await this.embed(values.slice(offset, offset + this.maxBatchSize), onUsage, options));
      }
      return vectors;
    }
    const startedAt = performance.now();
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const abortSignal = options?.abortSignal ? AbortSignal.any([options.abortSignal, timeoutSignal]) : timeoutSignal;
    const result = await embedMany({
      model: this.api,
      values,
      abortSignal,
      maxParallelCalls: this.maxParallelCalls,
      telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.embeddingAi.embed",
      },
    });
    const latencyMs = performance.now() - startedAt;
    const totalCostUsd = this.inputCostPerMillionTokens !== undefined ? (result.usage.tokens * this.inputCostPerMillionTokens) / 1_000_000 : undefined;
    await onUsage?.({
      provider: this.providerName,
      model: this.model,
      latencyMs,
      inputTokens: result.usage.tokens,
      totalTokens: result.usage.tokens,
      ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
      ...(this.pricingVersion ? { pricingVersion: this.pricingVersion } : {}),
      ...(this.pricingSource ? { pricingSource: this.pricingSource } : {}),
      ...(this.pricingEffectiveDate ? { pricingEffectiveDate: this.pricingEffectiveDate } : {}),
      ...(this.inputCostPerMillionTokens !== undefined ? { ratesUsdPerMillionTokens: { input: this.inputCostPerMillionTokens } } : {}),
    });
    return result.embeddings.map((embedding) => normalizeEmbedding(embedding));
  }
}

function hasVersionedPricing(config: Pick<EmbeddingAiConfig, "pricingVersion" | "pricingSource" | "pricingEffectiveDate">): boolean {
  return Boolean(config.pricingVersion?.trim() && config.pricingSource?.trim() && config.pricingEffectiveDate?.trim());
}

export function normalizeEmbedding(values: number[]): number[] {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding provider returned ${values.length} dimensions; this deployment requires exactly ${EMBEDDING_DIMENSIONS}.`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned a non-finite value.");
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("Embedding provider returned a zero vector.");
  return values.map((value) => value / norm);
}

export function createEmbeddingFingerprint(input: { baseURL: string; model: string; providerName: string; revision?: string }): string {
  return createHash("sha256").update(JSON.stringify({
    baseURL: input.baseURL.replace(/\/$/, ""),
    model: input.model,
    providerName: input.providerName,
    dimensions: EMBEDDING_DIMENSIONS,
    revision: input.revision ?? "1",
  })).digest("hex");
}

export type EmbeddingAiEnvironment = Record<string, string | undefined>;

export function createEmbeddingProvider(environment: EmbeddingAiEnvironment = process.env): OpenAiCompatibleEmbeddingProvider | undefined {
  const baseURL = environment.AI_EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_AI_BASE_URL;
  const apiKey = environment.AI_EMBEDDING_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  if (!apiKey && trimTrailingSlashes(baseURL) === DEFAULT_EMBEDDING_AI_BASE_URL) return undefined;
  const inputCostPerMillionTokens = parseOptionalNumber(environment.AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS);
  const timeoutMs = parsePositiveNumber(environment.AI_EMBEDDING_TIMEOUT_MS);
  const maxParallelCalls = parsePositiveNumber(environment.AI_EMBEDDING_MAX_PARALLEL_CALLS);
  return new OpenAiCompatibleEmbeddingProvider({
    ...(apiKey ? { apiKey } : {}),
    ...(environment.AI_EMBEDDING_MODEL ? { model: environment.AI_EMBEDDING_MODEL } : {}),
    ...(environment.AI_EMBEDDING_BASE_URL?.trim() ? { baseURL: environment.AI_EMBEDDING_BASE_URL.trim() } : {}),
    ...(environment.AI_EMBEDDING_PROVIDER_NAME ? { name: environment.AI_EMBEDDING_PROVIDER_NAME } : {}),
    ...(environment.AI_EMBEDDING_REVISION ? { revision: environment.AI_EMBEDDING_REVISION } : {}),
    ...(environment.AI_EMBEDDING_PRICING_VERSION?.trim() ? { pricingVersion: environment.AI_EMBEDDING_PRICING_VERSION.trim() } : {}),
    ...(environment.AI_EMBEDDING_PRICING_SOURCE?.trim() ? { pricingSource: environment.AI_EMBEDDING_PRICING_SOURCE.trim() } : {}),
    ...(environment.AI_EMBEDDING_PRICING_EFFECTIVE_DATE?.trim() ? { pricingEffectiveDate: environment.AI_EMBEDDING_PRICING_EFFECTIVE_DATE.trim() } : {}),
    ...(inputCostPerMillionTokens !== undefined ? { inputCostPerMillionTokens } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(environment.AI_EMBEDDING_MAX_BATCH_SIZE ? { maxBatchSize: Number(environment.AI_EMBEDDING_MAX_BATCH_SIZE) } : {}),
    ...(maxParallelCalls !== undefined ? { maxParallelCalls } : {}),
  });
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
