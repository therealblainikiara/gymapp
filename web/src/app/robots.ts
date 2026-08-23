import type { MetadataRoute } from "next";

/**
 * Keep the demo out of search results.
 *
 * The deployed site is a demo: it takes real sign-ups and stores real health
 * data, and its liability disclaimer has not been through legal review yet
 * (C5 in ECC-PLAN.md). Both are fine for a demo people are pointed at
 * deliberately; neither is something to have indexed under your name.
 *
 * AT GO-LIVE: delete this file. That is the whole change — Next serves no
 * robots.txt without it, and crawlers index normally.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
