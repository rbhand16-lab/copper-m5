// Module 5: tracing is off without Langfuse keys, so the app still runs with
// no environment variables.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureTracing,
  flushTracing,
  isTracingConfigured,
} from "@/lib/ai/tracing";

afterEach(() => vi.unstubAllEnvs());

describe("tracing", () => {
  it("is off without keys, and doing nothing is safe", async () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "");
    expect(isTracingConfigured()).toBe(false);
    expect(() => ensureTracing()).not.toThrow();
    await expect(flushTracing()).resolves.toBeUndefined();
  });

  it("needs both keys", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "");
    expect(isTracingConfigured()).toBe(false);
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    expect(isTracingConfigured()).toBe(true);
  });
});
