// lib/ai/client.js
//
// The only place the backend calls Claude. Every call:
//  - returns JSON validated against the step's schema (structured outputs, design.md D-032);
//  - puts the frozen system prompt first with a cache breakpoint (design.md D-033);
//  - checks stop_reason before reading content, and opts into server-side fallbacks (D-034);
//  - returns token usage for the job's cost record.

import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

import { STEP_CONFIG } from "./config.js";
import { AiOutputError, AiRefusalError } from "./errors.js";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client;
const getClient = () => (client ??= new Anthropic());

// Flipped off for the life of the process if the API rejects the fallback parameter for this account.
let fallbacksAvailable = process.env.ANTHROPIC_DISABLE_FALLBACKS !== "true";

function usageOf(step, response) {
  const usage = response.usage ?? {};
  return {
    step,
    model: response.model,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    stop_reason: response.stop_reason ?? null,
    at: new Date().toISOString(),
  };
}

async function parse(params) {
  const anthropic = getClient();

  if (fallbacksAvailable) {
    try {
      return await anthropic.beta.messages.parse({
        ...params,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
    } catch (error) {
      const fallbackRejected =
        error instanceof Anthropic.BadRequestError && /fallback|beta/i.test(error.message ?? "");
      if (!fallbackRejected) throw error;
      fallbacksAvailable = false;
      console.warn("[ai] Server-side fallbacks were rejected; continuing without them:", error.message);
    }
  }

  return anthropic.messages.parse(params);
}

/**
 * Calls Claude for one pipeline step and returns `{ data, usage }`.
 * Throws AiRefusalError or AiOutputError (both carry usage), or the SDK's typed API errors.
 */
export async function callStructured({ step, system, messages, schema }) {
  const config = STEP_CONFIG[step];
  if (!config) throw new Error(`Unknown AI step "${step}"`);

  const response = await parse({
    model: config.model,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: {
      effort: config.effort,
      format: jsonSchemaOutputFormat(schema),
    },
  });

  const usage = usageOf(step, response);

  if (response.stop_reason === "refusal") {
    throw new AiRefusalError({ usage, category: response.stop_details?.category });
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiOutputError(`The ${step} response was cut off at ${config.maxTokens} tokens.`, usage);
  }
  if (response.parsed_output == null) {
    throw new AiOutputError(`The ${step} response didn't match its schema.`, usage);
  }

  return { data: response.parsed_output, usage };
}
