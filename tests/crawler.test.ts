import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { discoverUrls } from "../src/lib/crawler.js";

let server: Server;
let baseUrl: string;
let serverMode: "normal" | "redirect-loop" | "redirect-ok" | "no-sitemap" =
  "normal";

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const url = req.url || "/";

        // ── Sitemap route ──
        if (url === "/sitemap.xml") {
          switch (serverMode) {
            case "redirect-loop":
              res.writeHead(301, { Location: "/redir/1" });
              res.end();
              return;
            case "redirect-ok":
              res.writeHead(301, { Location: "/redir-ok/1" });
              res.end();
              return;
            case "no-sitemap":
              res.writeHead(404);
              res.end("Not found");
              return;
            default:
              res.writeHead(200, { "Content-Type": "text/xml" });
              res.end(
                `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/</loc></url><url><loc>${baseUrl}/about</loc></url></urlset>`
              );
              return;
          }
        }

        // ── Infinite redirect chain ──
        if (url.startsWith("/redir/")) {
          const n = parseInt(url.split("/")[2]);
          res.writeHead(301, { Location: `/redir/${n + 1}` });
          res.end();
          return;
        }

        // ── Limited redirect chain (3 hops → sitemap) ──
        if (url.startsWith("/redir-ok/")) {
          const n = parseInt(url.split("/")[2]);
          if (n < 3) {
            res.writeHead(301, { Location: `/redir-ok/${n + 1}` });
            res.end();
          } else {
            res.writeHead(200, { "Content-Type": "text/xml" });
            res.end(
              `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/redirected-page</loc></url></urlset>`
            );
          }
          return;
        }

        // ── HTML pages for BFS crawling ──
        if (
          url === "/" ||
          url === "/about" ||
          url === "/contact" ||
          url === "/redirected-page"
        ) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            `<html><body><a href="/">Home</a> <a href="/about">About</a> <a href="/contact">Contact</a></body></html>`
          );
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      });

      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    })
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    })
);

beforeEach(() => {
  serverMode = "normal";
});

describe("discoverUrls", () => {
  it("discovers URLs via sitemap", async () => {
    serverMode = "normal";
    const result = await discoverUrls(baseUrl);
    expect(result.method).toBe("sitemap");
    expect(result.urls).toContain(`${baseUrl}/`);
    expect(result.urls).toContain(`${baseUrl}/about`);
  });

  it("falls back to BFS crawl when no sitemap", async () => {
    serverMode = "no-sitemap";
    const result = await discoverUrls(baseUrl);
    expect(result.method).toBe("crawl");
    expect(result.urls.length).toBeGreaterThan(0);
    // BFS should find the homepage at minimum
    expect(result.urls).toContain(`${baseUrl}/`);
  });

  it("BFS discovers linked pages", async () => {
    serverMode = "no-sitemap";
    const result = await discoverUrls(baseUrl);
    expect(result.method).toBe("crawl");
    // The homepage links to /, /about, /contact
    expect(result.urls).toContain(`${baseUrl}/about`);
    expect(result.urls).toContain(`${baseUrl}/contact`);
  });

  it("handles redirect loop gracefully (falls back to BFS)", async () => {
    serverMode = "redirect-loop";
    const result = await discoverUrls(baseUrl);
    // Sitemap redirect loop → caught → falls back to BFS
    expect(result.method).toBe("crawl");
    expect(result.urls.length).toBeGreaterThan(0);
  });

  it("follows redirects within limit", async () => {
    serverMode = "redirect-ok";
    const result = await discoverUrls(baseUrl);
    // 3 redirects then valid sitemap
    expect(result.method).toBe("sitemap");
    expect(result.urls).toContain(`${baseUrl}/redirected-page`);
  });

  it("limits to MAX_PAGES (20)", async () => {
    // The test server only has a few pages, so this just verifies
    // the function doesn't return more than it finds
    serverMode = "normal";
    const result = await discoverUrls(baseUrl);
    expect(result.urls.length).toBeLessThanOrEqual(20);
  });
});
