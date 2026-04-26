import { NextRequest, NextResponse } from "next/server";
import { getR2Storage } from "@/lib/r2-storage";
import { JobMetadata } from "@/lib/job-statistics-r2";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CacheEntry {
  url: string;
  timestamp: string;
}

interface UrlCacheFile {
  entries: CacheEntry[];
  lastUpdated: string;
  metadata: { totalUrlsCached: number; version: string };
}

function fixIndeedUrl(url: string): string {
  if (!url.toLowerCase().includes("indeed")) return url;
  return url
    .replace("from=social_other", "from=jobsearch-empty-whatwhere")
    .replace(/amp;/g, "");
}

export async function GET(request: NextRequest) {
  logger.info("Starting Indeed URL fix scan...");

  const r2 = getR2Storage();
  if (!r2.isAvailable()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 500 });
  }

  const stats = {
    metadataFilesScanned: 0,
    metadataFilesUpdated: 0,
    metadataUrlsFixed: 0,
    urlIndexFixed: 0,
    urlCacheRssFixed: 0,
  };

  // ── 1. Fix metadata files (url field on each JobMetadata record) ──────────
  const manifest = await r2.getManifest();

  for (const month of manifest.availableMonths) {
    const monthData = manifest.months[month];
    if (!monthData?.days) continue;

    for (const day of monthData.days) {
      try {
        const records = await r2.getNDJSONGzipped<JobMetadata>(day.metadata);
        stats.metadataFilesScanned++;

        let changed = false;
        const fixed = records.map((job) => {
          const newUrl = fixIndeedUrl(job.url);
          if (newUrl !== job.url) {
            changed = true;
            stats.metadataUrlsFixed++;
            return { ...job, url: newUrl };
          }
          return job;
        });

        if (changed) {
          await r2.putNDJSONGzipped(day.metadata, fixed);
          stats.metadataFilesUpdated++;
          logger.info(`✓ Fixed ${day.metadata}`);
        }
      } catch (error) {
        logger.warn(`Failed to process ${day.metadata}:`, error);
      }
    }
  }

  // Also scan current month if not in availableMonths
  const currentMonthData = manifest.months[manifest.currentMonth];
  if (currentMonthData?.days && !manifest.availableMonths.includes(manifest.currentMonth)) {
    for (const day of currentMonthData.days) {
      try {
        const records = await r2.getNDJSONGzipped<JobMetadata>(day.metadata);
        stats.metadataFilesScanned++;

        let changed = false;
        const fixed = records.map((job) => {
          const newUrl = fixIndeedUrl(job.url);
          if (newUrl !== job.url) {
            changed = true;
            stats.metadataUrlsFixed++;
            return { ...job, url: newUrl };
          }
          return job;
        });

        if (changed) {
          await r2.putNDJSONGzipped(day.metadata, fixed);
          stats.metadataFilesUpdated++;
          logger.info(`✓ Fixed ${day.metadata}`);
        }
      } catch (error) {
        logger.warn(`Failed to process ${day.metadata}:`, error);
      }
    }
  }

  // ── 2. Fix url-index.json ─────────────────────────────────────────────────
  const urlIndexData = await r2.getJSON<{ urls: string[]; updatedAt: string; count: number }>(
    "url-index.json"
  );

  if (urlIndexData?.urls) {
    let changed = false;
    const fixedUrls = urlIndexData.urls.map((url) => {
      const fixed = fixIndeedUrl(url);
      if (fixed !== url) {
        changed = true;
        stats.urlIndexFixed++;
      }
      return fixed;
    });

    if (changed) {
      await r2.putJSON("url-index.json", {
        urls: fixedUrls,
        updatedAt: new Date().toISOString(),
        count: fixedUrls.length,
      }, "public, max-age=60");
      logger.info(`✓ Fixed url-index.json (${stats.urlIndexFixed} URLs)`);
    }
  }

  // ── 3. Fix url-cache/url-rss.json ────────────────────────────────────────
  const rssCache = await r2.getJSON<UrlCacheFile>("url-cache/url-rss.json");

  if (rssCache?.entries) {
    let changed = false;
    const fixedEntries = rssCache.entries.map((entry) => {
      const fixed = fixIndeedUrl(entry.url);
      if (fixed !== entry.url) {
        changed = true;
        stats.urlCacheRssFixed++;
      }
      return { ...entry, url: fixed };
    });

    if (changed) {
      await r2.putJSON("url-cache/url-rss.json", {
        ...rssCache,
        entries: fixedEntries,
        lastUpdated: new Date().toISOString(),
        metadata: {
          ...rssCache.metadata,
          totalUrlsCached: fixedEntries.length,
        },
      }, "public, max-age=60");
      logger.info(`✓ Fixed url-cache/url-rss.json (${stats.urlCacheRssFixed} URLs)`);
    }
  }

  logger.info("Indeed URL fix completed", stats);

  return NextResponse.json({
    success: true,
    stats,
  });
}
