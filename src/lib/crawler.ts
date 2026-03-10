import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";

const MAX_PAGES = 20;
const FETCH_TIMEOUT = 10_000;

function fetchText(url: string, maxRedirects = 5): Promise<string> {
  const get = url.startsWith("https") ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: FETCH_TIMEOUT }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        fetchText(new URL(res.headers.location, url).href, maxRedirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const hrefRegex = /<a\s[^>]*href\s*=\s*["']([^"'#]+)/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.hostname !== base.hostname) continue;
      if (!/^https?:$/.test(resolved.protocol)) continue;
      // Skip common non-page resources
      if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js|ico|xml|json|zip|woff2?)$/i.test(resolved.pathname)) continue;
      resolved.hash = "";
      resolved.search = "";
      const normalized = resolved.href;
      if (!seen.has(normalized)) {
        seen.add(normalized);
      }
    } catch {
      // Invalid URL, skip
    }
  }
  return [...seen];
}

export interface DiscoveryResult {
  urls: string[];
  method: "sitemap" | "crawl";
}

export async function discoverUrls(siteUrl: string): Promise<DiscoveryResult> {
  const base = new URL(siteUrl);
  const origin = base.origin;

  // Try sitemap.xml first
  try {
    const sitemapUrl = `${origin}/sitemap.xml`;
    const xml = await fetchText(sitemapUrl);
    const urls = extractSitemapUrls(xml).filter((u) => {
      try {
        return new URL(u).hostname === base.hostname;
      } catch {
        return false;
      }
    });
    if (urls.length > 0) {
      return { urls: urls.slice(0, MAX_PAGES), method: "sitemap" };
    }
  } catch {
    // No sitemap, fall through to crawl
  }

  // Fallback: BFS crawl from homepage
  const visited = new Set<string>();
  const toVisit = [origin + "/"];
  const found: string[] = [];

  while (toVisit.length > 0 && found.length < MAX_PAGES) {
    const url = toVisit.shift()!;
    const normalized = new URL(url).href;
    if (visited.has(normalized)) continue;
    visited.add(normalized);
    found.push(normalized);

    if (found.length >= MAX_PAGES) break;

    try {
      const html = await fetchText(normalized);
      const links = extractLinks(html, normalized);
      for (const link of links) {
        if (!visited.has(link) && !toVisit.includes(link)) {
          toVisit.push(link);
        }
      }
    } catch {
      // Page fetch failed, still include it for Lighthouse (it'll report the error)
    }
  }

  return { urls: found, method: "crawl" };
}
