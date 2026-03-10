import { runLighthouse } from "../lib/lighthouse.js";
import type { Device } from "../lib/types.js";

const VALID_CATEGORIES = ["performance", "accessibility", "seo", "best-practices"];

export async function analyzePerformance(args: {
  url: string;
  device?: Device;
  categories?: string[];
}) {
  const { url, device = "mobile", categories } = args;

  if (!url || typeof url !== "string") {
    throw new Error("url is required");
  }

  const cats = categories?.filter((c) => VALID_CATEGORIES.includes(c)) ?? ["performance"];

  const result = await runLighthouse(url, device, cats);
  return result;
}
