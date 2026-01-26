import fs from 'fs/promises';
import path from 'path';
import { SitemapStream, streamToPromise } from 'sitemap';
import { createWriteStream } from 'fs';

const SITE_URL = 'https://gskis.com';
const SRC_PAGES = path.resolve(process.cwd(), 'src/pages');
const OUT_DIR = path.resolve(process.cwd(), 'public');
const OUT_FILE = path.join(OUT_DIR, 'sitemap.xml');

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
