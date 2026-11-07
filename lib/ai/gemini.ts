import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// The single Gemini wrapper (DESIGN 9). Every Gemini call in the app goes through generateJson().
//
// - reads GEMINI_API_KEY / GEMINI_MODEL from the server env
// - asks for JSON output (with a JSON schema made from the zod schema) and validates it with zod
// - every attempt has a timeout; one retry; then it throws GeminiError
// Callers catch GeminiError and use their fallback (lib/ai/fallback.ts). The key never appears in
// an error message or a log.

/** Used when GEMINI_MODEL is empty. Measured on 2026-11-07: flash-lite answers in ~1 s, while the
 *  full flash models (3.5 to 3.8) took 12-25 s or returned 503 "high demand". */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 15_000;
const ATTEMPTS = 2; // first try + one retry

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

/** True when a key is set. Callers may skip Gemini entirely (and go straight to the fallback). */
export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

let client: { key: string; ai: GoogleGenAI } | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set");
  if (client?.key !== key) client = { key, ai: new GoogleGenAI({ apiKey: key }) };
  return client.ai;
}

export interface GenerateJsonOptions<T> {
  /** Instructions for the model (role, rules, output format). */
  system?: string;
  /** The request itself, usually the data as JSON. */
  prompt: string;
  /** Shape of the answer; the reply is rejected unless it parses. */
  schema: z.ZodType<T>;
  /** Per attempt. Default 15 s. */
  timeoutMs?: number;
  temperature?: number;
}

/** Ask Gemini for JSON that matches `schema`. Throws GeminiError after the retry fails. */
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const ai = getClient(); // throws cleanly when the key is empty, before any network call
  const model = geminiModel();
  const jsonSchema = toJsonSchema(opts.schema);

  let lastError = "unknown error";
  let tried = 0;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    tried = attempt;
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await ai.models.generateContent({
        model,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.2,
          responseMimeType: "application/json",
          ...(jsonSchema ? { responseJsonSchema: jsonSchema } : {}),
          abortSignal: controller.signal,
        },
      });
      const text = res.text;
      if (!text) throw new GeminiError(`empty reply (finish reason: ${res.candidates?.[0]?.finishReason ?? "none"})`);

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new GeminiError("reply is not valid JSON");
      }
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new GeminiError(`reply does not match the schema: ${z.prettifyError(parsed.error).slice(0, 300)}`);
      }
      return parsed.data;
    } catch (err) {
      lastError = controller.signal.aborted ? `timed out after ${timeoutMs} ms` : describe(err);
      console.warn(`[gemini] attempt ${attempt}/${ATTEMPTS} with ${model} failed: ${lastError}`);
      if (isPermanent(err)) break; // bad key/model/request or quota used up: an instant retry cannot help
    } finally {
      clearTimeout(timer);
    }
  }
  throw new GeminiError(`Gemini failed after ${tried} attempt${tried === 1 ? "" : "s"}: ${lastError}`);
}

/** zod -> JSON schema for Gemini's structured output. Without it we still get JSON and validate it. */
function toJsonSchema(schema: z.ZodType): unknown {
  try {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>;
    void _ignored;
    return rest;
  } catch {
    return undefined;
  }
}

/** HTTP 400/401/403/404, and 429 (free-tier requests-per-minute quota: retrying at once only burns
 *  another request). 5xx such as 503 "high demand" is worth a retry. */
function isPermanent(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" && [400, 401, 403, 404, 429].includes(status);
}

/** Short error text that never contains the API key. */
function describe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const key = process.env.GEMINI_API_KEY?.trim();
  return (key ? msg.split(key).join("***") : msg).replace(/\s+/g, " ").slice(0, 300);
}
