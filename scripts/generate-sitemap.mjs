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

// Helper to convert string to kebab-case slug (mirrors the one in locations.ts)
function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Parse locations.ts and extract all location entries (states and cities)
async function getLocationUrls() {
  try {
    const content = await fs.readFile(LOCATIONS_FILE, 'utf8');
    // Extract the locations object from the TS file
    const match = content.match(/export const locations[^=]*=\s*(\{[\s\S]*?\n\};)/);
    if (!match) {
      console.warn('Could not parse locations from locations.ts');
      return [];
    }
    
    // Parse the JSON-like object (it's valid JSON in the generated file)
    const jsonStr = match[1].replace(/;$/, '');
    const locations = JSON.parse(jsonStr);
    
    const urls = [];
    for (const [stateSlug, cities] of Object.entries(locations)) {
      // Add state-level page URL
      urls.push({
        url: `/meetings/${stateSlug}`,
        lastmod: new Date().toISOString(),
      });
      
      // Add city-level page URLs
      for (const [citySlug, config] of Object.entries(cities)) {
        urls.push({
          url: `/meetings/${stateSlug}/${citySlug}`,
          lastmod: new Date().toISOString(),
        });
      }
    }
    return urls;
  } catch (e) {
    console.error('Error reading locations:', e);
    return [];
  }
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
