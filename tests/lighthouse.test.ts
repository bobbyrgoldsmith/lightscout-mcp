import { describe, it, expect } from "vitest";
import { truncateDesc } from "../src/lib/lighthouse.js";

describe("truncateDesc", () => {
  it("returns empty string for undefined", () => {
    expect(truncateDesc(undefined)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(truncateDesc("")).toBe("");
  });

  it("preserves short single sentence", () => {
    expect(truncateDesc("Short description")).toBe("Short description");
  });

  it("strips markdown links", () => {
    const input =
      "Use [WebP](https://web.dev/webp) for images. More info available.";
    const result = truncateDesc(input);
    expect(result).not.toContain("[");
    expect(result).not.toContain("](");
    // First sentence after stripping: "Use  for images"
    expect(result).toBe("Use  for images");
  });

  it("truncates to first sentence", () => {
    const input =
      "First sentence here. Second sentence here. Third sentence.";
    expect(truncateDesc(input)).toBe("First sentence here");
  });

  it("caps at 120 chars for long single sentence", () => {
    const long = "A".repeat(150);
    const result = truncateDesc(long);
    expect(result).toHaveLength(120);
    expect(result).toBe("A".repeat(117) + "...");
  });

  it("strips links before splitting sentences", () => {
    const input =
      "Resources are blocking paint. [Learn more](https://web.dev). Consider inlining CSS.";
    expect(truncateDesc(input)).toBe("Resources are blocking paint");
  });

  it("handles real Lighthouse description", () => {
    const input =
      "Image formats like WebP and AVIF often provide better compression than PNG or JPEG, which means faster downloads and less data consumption. [Learn more about modern image formats](https://web.dev/uses-webp-images/).";
    const result = truncateDesc(input);
    expect(result).not.toContain("[Learn more");
    // First sentence after link strip is >120 chars, so it gets truncated
    expect(result).toHaveLength(120);
    expect(result.endsWith("...")).toBe(true);
    expect(result).toContain("Image formats like WebP and AVIF");
  });

  it("handles description with only links", () => {
    const input = "[Learn more](https://example.com).";
    const result = truncateDesc(input);
    expect(result).toBe(".");
  });
});
