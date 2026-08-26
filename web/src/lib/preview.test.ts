import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The preview harness turns the auth gate off. That is the single worst thing
 * in this repo to get wrong, so the two locks are asserted rather than trusted:
 * `NODE_ENV !== "production"` and an explicit `NEXT_PUBLIC_PREVIEW_HARNESS=1`.
 *
 * The module reads `process.env` once at import, so each case stubs the
 * environment and re-imports. `resetModules` is what makes that work — without
 * it every case would see the first import's frozen value and the whole file
 * would pass no matter what the flag did.
 */
async function harnessWith(env: Record<string, string>): Promise<boolean> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const mod = await import("./preview");
  return mod.PREVIEW_HARNESS;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the preview harness flag", () => {
  it("is off in a production build even when the variable is set", async () => {
    expect(
      await harnessWith({
        NODE_ENV: "production",
        NEXT_PUBLIC_PREVIEW_HARNESS: "1",
      }),
    ).toBe(false);
  });

  it("is off in development unless the variable is set", async () => {
    expect(await harnessWith({ NODE_ENV: "development" })).toBe(false);
    expect(
      await harnessWith({
        NODE_ENV: "development",
        NEXT_PUBLIC_PREVIEW_HARNESS: "0",
      }),
    ).toBe(false);
    // Not truthiness — exactly "1". "true" is somebody guessing.
    expect(
      await harnessWith({
        NODE_ENV: "development",
        NEXT_PUBLIC_PREVIEW_HARNESS: "true",
      }),
    ).toBe(false);
  });

  it("is on only when both locks are open", async () => {
    expect(
      await harnessWith({
        NODE_ENV: "development",
        NEXT_PUBLIC_PREVIEW_HARNESS: "1",
      }),
    ).toBe(true);
  });

  it("uses a fake user id that is not a real account", async () => {
    vi.resetModules();
    const { PREVIEW_USER_ID } = await import("./preview");
    // A valid v4 UUID, because it becomes a database name and a user_id — a
    // shape the real schema would reject would hide bugs rather than show them.
    expect(PREVIEW_USER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(PREVIEW_USER_ID.startsWith("00000000-")).toBe(true);
  });
});
