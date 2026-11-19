import { OpenTelemetry } from "@ai-sdk/otel";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { registerTelemetry } from "ai";

// Observability (Module 5): every AI call is traced in Langfuse, with the
// agent, its tool calls, tokens, cost and time. The AI SDK emits the spans;
// this file sends them to Langfuse. With no Langfuse keys, nothing is sent and
// the app works as before.

export function isTracingConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
    process.env.LANGFUSE_SECRET_KEY?.trim(),
  );
}

// One setup per process, even when the dev server reloads this file.
const state = globalThis as typeof globalThis & {
  __copperTracing?: LangfuseSpanProcessor;
};

/** Starts sending traces to Langfuse, once. Called before every model call. */
export function ensureTracing(): void {
  if (state.__copperTracing || !isTracingConfigured()) return;
  const processor = new LangfuseSpanProcessor({
    environment: process.env.LANGFUSE_TRACING_ENVIRONMENT ?? "development",
  });
  new NodeTracerProvider({ spanProcessors: [processor] }).register();
  registerTelemetry(new OpenTelemetry());
  state.__copperTracing = processor;
}

/** Sends any traces still waiting. Call before a short-lived process or a request ends. */
export async function flushTracing(): Promise<void> {
  await state.__copperTracing?.forceFlush();
}
