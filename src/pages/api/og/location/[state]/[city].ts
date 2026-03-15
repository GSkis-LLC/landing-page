import type { APIRoute } from 'astro';
import { Resvg } from '@resvg/resvg-js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getLocation } from '../../../../../data/location-store';

const WIDTH = 1200;
const HEIGHT = 630;
const FONT_PATH = join(process.cwd(), 'public', 'fonts', 'SFPRODISPLAYREGULAR.OTF');
const BOLD_FONT_PATH = join(process.cwd(), 'public', 'fonts', 'SFPRODISPLAYBOLD.OTF');

let FONT_DATA: Uint8Array | null = null;
let HAS_BOLD = false;

async function getFonts(): Promise<Uint8Array> {
  if (FONT_DATA) return FONT_DATA;
  try {
    FONT_DATA = new Uint8Array(await fs.readFile(FONT_PATH));
    try {
      await fs.access(BOLD_FONT_PATH);
      HAS_BOLD = true;
    } catch {}
  } catch {
    FONT_DATA = new Uint8Array();
  }
  return FONT_DATA;
}

function esc(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeLocationSvg(cityName: string, stateAbbr: string): string {
  const cityLine = `${cityName}, ${stateAbbr}`;
  // Scale font down for long city+state strings to prevent overflow
  const cityFontSize = cityLine.length > 24 ? 68 : cityLine.length > 18 ? 82 : 96;
  const headlineY = 195;
  const cityY = headlineY + cityFontSize + 24;
  const subtitleY = cityY + 58;

  const startX = 96;

  const svgParts = [
    // Background gradient
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#ecfdf5" offset="0%" />
        <stop stop-color="#d1fae5" offset="55%" />
        <stop stop-color="#bfdbfe" offset="100%" />
      </linearGradient>
    </defs>`,
    `<rect fill="url(#bg)" x="0" y="0" width="100%" height="100%" />`,

    // Teal accent bar on left edge
    `<rect x="0" y="0" width="14" height="${HEIGHT}" fill="#2A9D8F" rx="0" />`,

    // "AA Meetings near" label
    `<text x="${startX}" y="${headlineY}" font-size="46" font-weight="400" font-family="SF Pro Display, -apple-system, system-ui" fill="#475569">${esc('AA Meetings near')}</text>`,

    // Large city + state
    `<text x="${startX}" y="${cityY}" font-size="${cityFontSize}" font-weight="700" font-family="SF Pro Display, -apple-system, system-ui" fill="#0f172a">${esc(cityLine)}</text>`,

    // Subtitle
    `<text x="${startX}" y="${subtitleY}" font-size="38" font-weight="400" font-family="SF Pro Display, -apple-system, system-ui" fill="#334155">${esc('Find local Alcoholics Anonymous meetings')}</text>`,

    // Divider
    `<line x1="${startX}" y1="530" x2="${WIDTH - 80}" y2="530" stroke="#cbd5e1" stroke-width="1.5" />`,

    // Footer — brand name
    `<text x="${startX}" y="582" font-size="34" font-weight="600" font-family="SF Pro Display, -apple-system, system-ui" fill="#334155">${esc('MyMeetings')}</text>`,

    // Footer — URL (right-aligned)
    `<text x="${WIDTH - 80}" y="582" text-anchor="end" font-size="34" font-weight="400" font-family="SF Pro Display, -apple-system, system-ui" fill="#64748b">${esc('mymeetings.co')}</text>`,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`AA Meetings near ${cityLine}`)}">
  ${svgParts.join('\n  ')}
</svg>`;
}

function svgToPng(svg: string, fontData: Uint8Array): Uint8Array {
  const fontFiles: string[] = [];
  if (fontData.length) {
    fontFiles.push(FONT_PATH);
    if (HAS_BOLD) fontFiles.push(BOLD_FONT_PATH);
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    background: 'white',
    font: fontFiles.length
      ? { fontFiles, defaultFontFamily: 'SF Pro Display', loadSystemFonts: false }
      : undefined,
  });
  return resvg.render().asPng();
}

export const GET: APIRoute = async ({ params }) => {
  const { state, city } = params;
  if (!state || !city) {
    return new Response('Not found', { status: 404 });
  }

  // Try to look up canonical names from location config
  const location = getLocation(state, city);
  const cityName =
    location?.city ??
    city
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const stateAbbr = location?.stateAbbr ?? state.toUpperCase().slice(0, 2);

  const svg = makeLocationSvg(cityName, stateAbbr);
  const fontData = await getFonts();
  const png = svgToPng(svg, fontData);

  return new Response(Buffer.from(png), {
    headers: {
      'Content-Type': 'image/png',
      // Cache aggressively — the image only changes when city data changes (rare)
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};

export const prerender = false;
