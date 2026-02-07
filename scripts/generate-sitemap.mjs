import fs from 'fs/promises';
import path from 'path';
import { SitemapStream, streamToPromise } from 'sitemap';
import { createWriteStream } from 'fs';
import { pathToFileURL } from 'url';

const SITE_URL = 'https://gskis.com';
const SRC_PAGES = path.resolve(process.cwd(), 'src/pages');
const OUT_DIR = path.resolve(process.cwd(), 'public');
const OUT_FILE = path.join(OUT_DIR, 'sitemap.xml');
const LOCATIONS_FILE = path.resolve(process.cwd(), 'src/data/locations.ts');
const STATES_DIR = path.resolve(process.cwd(), 'src/data/locations/states');

// Parse locations.ts and extract all location entries (states and cities)
async function getLocationUrls() {
  const urls = [];

  try {
    const entries = await fs.readdir(STATES_DIR, { withFileTypes: true });
    const stateFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name);

    if (stateFiles.length > 0) {
      for (const file of stateFiles) {
        const stateSlug = file.replace(/\.json$/, '');
        const content = await fs.readFile(path.join(STATES_DIR, file), 'utf8');
        const cities = JSON.parse(content);

        urls.push({
          url: `/meetings/${stateSlug}`,
          lastmod: new Date().toISOString(),
        });

        for (const citySlug of Object.keys(cities)) {
          urls.push({
            url: `/meetings/${stateSlug}/${citySlug}`,
            lastmod: new Date().toISOString(),
          });
        }
      }

      return urls;
    }
  } catch (e) {
    console.warn('State-split locations not found, falling back to locations.ts');
  }

  try {
    const content = await fs.readFile(LOCATIONS_FILE, 'utf8');
    const match = content.match(/export const locations[^=]*=\s*(\{[\s\S]*?\n\};)/);
    if (!match) {
      console.warn('Could not parse locations from locations.ts');
      return [];
    }

    const jsonStr = match[1].replace(/;$/, '');
    const locations = JSON.parse(jsonStr);

    for (const [stateSlug, cities] of Object.entries(locations)) {
      urls.push({
        url: `/meetings/${stateSlug}`,
        lastmod: new Date().toISOString(),
      });

      for (const citySlug of Object.keys(cities)) {
        urls.push({
          url: `/meetings/${stateSlug}/${citySlug}`,
          lastmod: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error('Error reading locations:', e);
  }

  return urls;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(res));
    } else {
      files.push(res);
    }
  }
  return files;
}

function toUrlPath(filePath) {
  // filePath is absolute
  let rel = path.relative(SRC_PAGES, filePath).split(path.sep).join('/');
  // skip files with dynamic segments
  if (rel.includes('[') || rel.includes(']')) return null;
  // Skip api/internal folders
  if (rel.startsWith('api/') || rel.startsWith('a/') || rel.startsWith('og/')) return null;

  // Remove extension and handle index pages
  rel = rel.replace(/index\.(astro|md|mdx)$/i, '');
  rel = rel.replace(/\.(astro|md|mdx)$/i, '');

  let url = '/' + rel;
  // normalize
  url = url.replace(/\\/g, '/');
  if (url === '/index' || url === '/') url = '/';
  // remove trailing slash (except root)
  if (url.length > 1 && url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

async function generate() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const allFiles = await walk(SRC_PAGES);
  const pageFiles = allFiles.filter(f => /\.(astro|md|mdx)$/i.test(f));

  const urls = [];
  for (const f of pageFiles) {
    const p = toUrlPath(f);
    if (!p) continue;
    try {
      const st = await fs.stat(f);
      urls.push({ url: p, lastmod: st.mtime.toISOString() });
    } catch (e) {
      urls.push({ url: p });
    }
  }

  // Add dynamic location routes from locations.ts
  const locationUrls = await getLocationUrls();
  urls.push(...locationUrls);
  console.log(`Added ${locationUrls.length} location URLs from locations.ts`);

  // Ensure we always include root
  if (!urls.find(u => u.url === '/')) urls.unshift({ url: '/', lastmod: new Date().toISOString() });

  const stream = new SitemapStream({ hostname: SITE_URL });
  for (const u of urls) {
    stream.write(u);
  }
  stream.end();

  const xml = await streamToPromise(stream);
  await fs.writeFile(OUT_FILE, xml.toString(), 'utf8');
  console.log(`Wrote sitemap to ${OUT_FILE} (${urls.length} entries)`);

  // Also write a short sitemap index (optional) pointing to sitemap.xml
  const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${SITE_URL}/sitemap.xml</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </sitemap>\n</sitemapindex>`;
  await fs.writeFile(path.join(OUT_DIR, 'sitemap-index.xml'), index, 'utf8');
}

generate().catch(err => {
  console.error('Sitemap generation failed:', err);
  process.exit(1);
});
