import type { APIRoute } from 'astro';
import { Resvg } from '@resvg/resvg-js';
import { promises as fs } from 'fs';
import { join } from 'path';
import QRCode from 'qrcode-generator';

// Simple in-memory LRU-ish cache (very small, ephemeral)
interface CacheEntry { body: Uint8Array; etag: string; created: number; }
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes
const CACHE_MAX = 100; // max entries

function getCache(key: string, ifNoneMatch?: string) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.created > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  if (ifNoneMatch && ifNoneMatch === hit.etag) {
    return { notModified: true } as const;
  }
  return { entry: hit } as const;
}

function setCache(key: string, body: Uint8Array) {
  if (CACHE.size >= CACHE_MAX) {
    const firstKey = CACHE.keys().next().value;
    if (firstKey) CACHE.delete(firstKey);
  }
  const etag = 'W/"' + Buffer.from(crypto.randomUUID()).toString('base64').slice(0, 16) + '"';
  CACHE.set(key, { body, etag, created: Date.now() });
  return etag;
}

// Simple HTML escape
function esc(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

const WIDTH = 1200;
const HEIGHT = 630;
const FONT_PATH = join(process.cwd(), 'public', 'fonts', 'SFPRODISPLAYREGULAR.OTF');
const BOLD_FONT_PATH = join(process.cwd(), 'public', 'fonts', 'SFPRODISPLAYBOLD.OTF');
let FONT_DATA: Uint8Array | null = null;
let HAS_BOLD = false;
async function getFont(): Promise<Uint8Array> {
  if (FONT_DATA) return FONT_DATA;
  try {
    FONT_DATA = new Uint8Array(await fs.readFile(FONT_PATH));
    // detect bold font
    try { await fs.access(BOLD_FONT_PATH); HAS_BOLD = true; } catch {}
  } catch (e) {
    FONT_DATA = new Uint8Array();
  }
  return FONT_DATA;
}

export const GET: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) {
    return new Response('Missing id', { status: 400 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format')?.toLowerCase() === 'svg' ? 'svg' : 'png';
  const isAttendance = url.searchParams.get('type') === 'attendance';
  const cacheKey = `${id}:${format}:${isAttendance ? 'attendance' : 'meeting'}`;
  const ifNoneMatch = request.headers.get('if-none-match') || undefined;
  const cached = getCache(cacheKey, ifNoneMatch);
  if (cached?.notModified) {
    return new Response(null, { status: 304 });
  } else if (cached?.entry) {
    return new Response(cached.entry.body, { headers: headers(format, cached.entry.etag) });
  }

  if (isAttendance) {
    // Attendance variant
    let attendance: any = null;
    try {
      const res = await fetch(`https://api.gskis.com/api/meeting-attendances/hash/${id}`);
      if (!res.ok) throw new Error('Not found');
      attendance = await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const svgError = makeSvg({
        title: 'Attendance Not Found',
        subtitle: esc(msg),
        types: [],
        variant: 'attendance'
      });
      if (format === 'svg') {
        return new Response(svgError, { status: 404, headers: headers('svg') });
      } else {
        const pngErr = svgToPng(makePlainSvg({ title: 'Attendance Not Found', subtitle: esc(msg), types: [], variant: 'attendance' }));
        const etag = setCache(cacheKey, pngErr);
        return new Response(pngErr, { status: 404, headers: headers('png', etag) });
      }
    }

    const meeting = attendance?.Meeting || {};
    const user = attendance?.User || {};
    const attendanceDate = attendance?.attendanceDate || '';
    const soberDate = user?.soberDate || '';
    const username = user?.username || 'Someone';

    const title = truncate(`${username} went to ${meeting?.name || 'a meeting'}`, 70);
    const location = meeting?.location || meeting?.formatted_address || '';
    const formatted_address = meeting?.formatted_address || '';
    const day = dayOfWeek(meeting?.day);
    const time = formatTime(meeting?.time);
    const end = formatTime(meeting?.end_time);
    const subtitleParts = [location, day && time ? `${day} ${time}${end ? ' - ' + end : ''}` : ''];
    const subtitle = truncate(subtitleParts.filter(Boolean).join(' • '), 110);
    const types: string[] = (meeting?.types || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean)
      .slice(0, 5);

    const soberTime = computeSoberTime(soberDate, attendanceDate);

    const svg = makeSvg({ title: esc(title), subtitle: esc(subtitle), types: types.map(esc), address: esc(formatted_address), id, variant: 'attendance', soberTime: soberTime ? esc(soberTime) : undefined });
    if (format === 'svg') {
      return new Response(svg, { headers: headers('svg') });
    }
    const plain = makePlainSvg({ title: esc(title), subtitle: esc(subtitle), types: types.map(esc), address: esc(formatted_address), id, variant: 'attendance', soberTime: soberTime ? esc(soberTime) : undefined });
    const fontData = await getFont();
    const png = svgToPng(plain, fontData);
    const etag = setCache(cacheKey, png);
    return new Response(png, { headers: headers('png', etag) });
  }

  // Meeting (default) variant
  let meeting: any = null;
  try {
    const res = await fetch(`https://api.gskis.com/api/meetings/${id}`);
    if (!res.ok) throw new Error('Not found');
    meeting = await res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const svgError = makeSvg({
      title: 'Meeting Not Found',
      subtitle: esc(msg),
      types: [],
      variant: 'meeting'
    });
    if (format === 'svg') {
      return new Response(svgError, { status: 404, headers: headers('svg') });
    } else {
      const pngErr = svgToPng(makePlainSvg({ title: 'Meeting Not Found', subtitle: esc(msg), types: [], variant: 'meeting' }));
      const etag = setCache(cacheKey, pngErr);
      return new Response(pngErr, { status: 404, headers: headers('png', etag) });
    }
  }

  const title = truncate(meeting?.name || 'Meeting', 70);
  const location = meeting?.location || meeting?.formatted_address || '';
  const formatted_address = meeting?.formatted_address || '';
  const day = dayOfWeek(meeting?.day);
  const time = formatTime(meeting?.time);
  const end = formatTime(meeting?.end_time);
  const subtitleParts = [location, day && time ? `${day} ${time}${end ? ' - ' + end : ''}` : ''];
  const subtitle = truncate(subtitleParts.filter(Boolean).join(' • '), 110);
  const types: string[] = (meeting?.types || '')
    .split(',')
    .map((t: string) => t.trim())
    .filter(Boolean)
    .slice(0, 5); // show up to 5

  const svg = makeSvg({ title: esc(title), subtitle: esc(subtitle), types: types.map(esc), address: esc(formatted_address) , id, variant: 'meeting' });
  if (format === 'svg') {
    return new Response(svg, { headers: headers('svg') });
  }
  const plain = makePlainSvg({ title: esc(title), subtitle: esc(subtitle), types: types.map(esc), address: esc(formatted_address), id, variant: 'meeting' });
  const fontData = await getFont();
  const png = svgToPng(plain, fontData);
  const etag = setCache(cacheKey, png);
  return new Response(png, { headers: headers('png', etag) });
};

function svgToPng(svg: string, fontData?: Uint8Array): Uint8Array {
  let fontFiles: string[] | undefined;
  if (fontData && fontData.length) {
    fontFiles = [FONT_PATH];
    if (HAS_BOLD) fontFiles.push(BOLD_FONT_PATH);
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    background: 'white',
    font: fontFiles ? { fontFiles, defaultFontFamily: 'SF Pro Display', loadSystemFonts: false } : undefined,
  });
  return resvg.render().asPng();
}

function headers(format: 'svg' | 'png', etag?: string) {
  return {
    'Content-Type': format === 'svg' ? 'image/svg+xml; charset=utf-8' : 'image/png',
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
    ...(etag ? { ETag: etag } : {}),
  };
}

function formatTime(t: string | undefined) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return t;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m}${ampm}`;
}

function dayOfWeek(num: number | undefined) {
  if (num == null) return '';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[num] || '';
}

interface SvgData {
  title: string;
  subtitle: string;
  types: string[];
  address?: string;
  id?: string;
  variant?: 'meeting' | 'attendance';
  soberTime?: string;
}

function computeSoberTime(soberDateStr: string, referenceDateStr: string): string | null {
  if (!soberDateStr || !referenceDateStr) return null;
  const soberDate = new Date(soberDateStr);
  const refDate = new Date(referenceDateStr);
  if (isNaN(soberDate.getTime()) || isNaN(refDate.getTime())) return null;
  if (refDate < soberDate) return null;
  const diffMs = refDate.getTime() - soberDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const remainingAfterYears = diffDays - years * 365;
  const months = Math.floor(remainingAfterYears / 30);
  const days = remainingAfterYears - months * 30;

  function plural(n: number, word: string) { return n + ' ' + (n === 1 ? word : word + 's'); }

  if (years > 0) {
    if (months > 0) return `${plural(years, 'year')} ${plural(months, 'month')}`;
    return plural(years, 'year');
  }
  if (months > 0) {
    if (days > 0) return `${plural(months, 'month')} ${plural(days, 'day')}`;
    return plural(months, 'month');
  }
  return plural(diffDays, 'day');
}

function makeSvg({ title, subtitle, types, address, id, variant = 'meeting', soberTime }: SvgData) {
  const gradientId = 'g';
  const typeBadges = types
    .map((t) => `<span class=\"badge\">${t}</span>`)
    .join('');
  const css = `
    .wrap { font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif; width: ${WIDTH}px; height: ${HEIGHT}px; display: flex; flex-direction: column; padding: 60px 80px; box-sizing: border-box; justify-content: space-between; }
    .top { max-width: 900px; }
    h1 { margin: 0 0 24px 0; font-size: 72px; line-height: 1.05; letter-spacing: -1px; font-weight: 700; fill: #0f172a; }
    h2 { margin: 0 0 18px 0; font-size: 36px; line-height: 1.2; font-weight: 400; color: #334155; }
    .addr { font-size: 30px; line-height: 1.25; font-weight: 400; color: #475569; margin: 0 0 28px 0; }
    .badges { display: flex; gap: 12px; flex-wrap: wrap; }
    .badge { font-size: 28px; line-height: 1; padding: 14px 26px; background: #e2e8f0; color: #1e293b; border-radius: 40px; font-weight: 500; }
    .footer { font-size: 30px; color: #334155; display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 18px; font-weight:600; }
    .brand-icon { width: 56px; height: 56px; background:#0f766e; color:#fff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:34px; font-weight:700; }
  `;
  const meetingUrl = id ? `https://gskis.com/meeting/${encodeURIComponent(id)}` : 'https://gskis.com/meeting';
  let extra = '';
  if (variant === 'attendance' && soberTime) {
    // Plain sober time text (no leaf)
    extra = `\n  <text x=\"${WIDTH - 80}\" y=\"${HEIGHT - 120}\" text-anchor=\"end\" font-size=\"48\" font-weight=\"600\" font-family=\"SF Pro Display, -apple-system, system-ui\" fill=\"#0f172a\">${soberTime} sober</text>`;
  }
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg width=\"${WIDTH}\" height=\"${HEIGHT}\" viewBox=\"0 0 ${WIDTH} ${HEIGHT}\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"${title}\">\n  <defs>\n    <linearGradient id=\"${gradientId}\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop stop-color=\"#ecfdf5\" offset=\"0%\" />\n      <stop stop-color=\"#d1fae5\" offset=\"50%\" />\n      <stop stop-color=\"#bfdbfe\" offset=\"100%\" />\n    </linearGradient>\n    <style>${css}</style>\n  </defs>\n  <rect fill=\"url(#${gradientId})\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" rx=\"0\" />\n  <foreignObject x=\"0\" y=\"0\" width=\"100%\" height=\"100%\">\n    <div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wrap\">\n      <div class=\"top\">\n        <h1>${title}</h1>\n        ${subtitle ? `<h2>${subtitle}</h2>` : ''}\n        ${address ? `<div class=\\"addr\\">${address}</div>` : ''}\n        ${types.length ? `<div class=\\"badges\\">${typeBadges}</div>` : ''}\n      </div>\n      <div class=\"footer\">\n        <div class=\"brand\"><div class=\"brand-icon\">M</div> MyMeetings</div>\n        <div>${meetingUrl.replace('https://','')}</div>\n      </div>\n    </div>\n  </foreignObject>${extra}\n</svg>`;
}

function makePlainSvg({ title, subtitle, types, address, id, variant = 'meeting', soberTime }: SvgData) {
  // Type color mapping (background, text)
  const typeStyles: Record<string, { bg: string; fg: string }> = {
    'Beginner': { bg: 'rgba(34,197,94,0.3)', fg: '#22c55e' },
    'Big Book': { bg: 'rgba(20,184,166,0.3)', fg: '#14b8a6' },
    'Closed': { bg: 'rgba(239,68,68,0.3)', fg: '#ef4444' },
    'Discussion': { bg: 'rgba(251,146,60,0.3)', fg: '#fb923c' },
    'English': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Grapevine': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Literature': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Men': { bg: 'rgba(37,99,235,0.3)', fg: '#2563eb' },
    'Open': { bg: 'rgba(6,182,212,0.3)', fg: '#06b6d4' },
    'Step': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Speaker': { bg: 'rgba(153,246,228,0.3)', fg: '#14b8a6' },
    'Step/Tradition': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Tradition': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Women': { bg: 'rgba(236,72,153,0.3)', fg: '#ec4899' },
    'Wheelchair Access': { bg: 'rgba(209,213,219,0.3)', fg: '#222' },
    'Young People': { bg: 'rgba(253,224,71,0.3)', fg: '#fde047' },
  };
  const titleFontSize = 64;
  const subtitleFontSize = 44; // Increased by 30% from 34
  // Use full horizontal space: startX (80) + right margin 80
  const startX = 60;
  const contentMaxWidth = WIDTH - startX - 60; // 1200 - 160 = 1040

  // Character width approximation reused for wrapping
  function charWidth(ch: string, fontSize: number) {
    const base = fontSize * 0.5;
    if (/[MW@#]/.test(ch)) return base * 1.25;
    if (/[ilI'`\.:;\|]/.test(ch)) return base * 0.45;
    if (/[fjt!l]/.test(ch)) return base * 0.55;
    if (/[0-9A-Z]/.test(ch)) return base * 1.0;
    return base * 0.9;
  }
  function lineWidth(text: string, fontSize: number) {
    let w = 0; for (const ch of text) w += charWidth(ch, fontSize); return w; }
  function wrapPrecise(text: string, fontSize: number, max: number) {
    const words = text.split(/\s+/);
    const lines: string[] = []; let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (lineWidth(candidate, fontSize) > max && current) {
        lines.push(current); current = word; }
      else { current = candidate; }
    }
    if (current) lines.push(current);
    return lines;
  }
  const titleLines = wrapPrecise(title, titleFontSize, contentMaxWidth);
  const subtitleLines = subtitle ? wrapPrecise(subtitle, subtitleFontSize, contentMaxWidth) : [];
  const addressFontSize = 39; // Increased by 30% from 30
  const addressLines = address ? wrapPrecise(address, addressFontSize, contentMaxWidth) : [];

  const badgeFontSize = 36; // Increased by 30% from 28
  const badgePaddingX = 23; // Adjusted proportionally
  const badgePaddingY = 16; // Adjusted proportionally
  const badgeGap = 18; // Adjusted proportionally
  let y = 120;
  const lineGap = 10;
  let svgText = '';
  // Always use actual bold font now that it's present; remove faux bold stroke fallback
  for (const l of titleLines) {
    svgText += `<text x="${startX}" y="${y}" font-size="${titleFontSize}" font-weight="700" font-family="SF Pro Display, -apple-system, system-ui" fill="#0f172a">${l}</text>`;
    y += titleFontSize + lineGap;
  }
  if (subtitleLines.length) y += 10;
  for (const l of subtitleLines) {
    svgText += `<text x="${startX}" y="${y}" font-size="${subtitleFontSize}" font-weight="400" font-family="SF Pro Display, -apple-system, system-ui" fill="#334155">${l}</text>`;
    y += subtitleFontSize + 6;
  }
  if (addressLines.length) {
    y += 4; // slight gap after subtitle
    for (const l of addressLines) {
      svgText += `<text x="${startX}" y="${y}" font-size="${addressFontSize}" font-weight="400" font-family="SF Pro Display, -apple-system, system-ui" fill="#475569">${l}</text>`;
      y += addressFontSize + 4;
    }
    y += 10; // extra margin before badges
  }
  function approxWidth(text: string, fontSize: number) { return lineWidth(text, fontSize); }
  if (types.length) {
    const badgeTopMargin = 39; // Adjusted proportionally
    y += badgeTopMargin;
    let currentX = startX;
    const maxRowWidth = WIDTH - startX - 80;
    for (const t of types) {
      const w = approxWidth(t, badgeFontSize);
      // Dynamic trailing adjust so longer labels still retain right padding.
      const trailingAdjust = Math.min(36, 8 + Math.round((t.length * badgeFontSize * 0.15) / 4));
      const boxW = Math.round(w + badgePaddingX * 2 + trailingAdjust);
      if (currentX + boxW > startX + maxRowWidth) {
        currentX = startX;
        y += badgeFontSize + badgePaddingY * 2 + badgeGap;
      }
      const boxH = badgeFontSize + badgePaddingY * 2;
      const rectY = y - badgeFontSize - badgePaddingY;
      const style = typeStyles[t] || { bg: '#e2e8f0', fg: '#1e293b' };
      svgText += `<g>\n        <rect x="${currentX}" y="${rectY}" rx="20" ry="20" width="${boxW}" height="${boxH}" fill="${style.bg}" />\n        <text x="${currentX + badgePaddingX}" y="${y - 7}" font-size="${badgeFontSize}" font-weight="500" font-family="SF Pro Display, -apple-system, system-ui" fill="${style.fg}">${t}</text>\n      </g>`;
      currentX += boxW + badgeGap;
    }
    y += badgeFontSize + badgePaddingY + 36;
  } else {
    y += 36;
  }
  const footerY = HEIGHT - 30;

  if (variant === 'attendance') {
    if (soberTime) {
      const textX = WIDTH - 60;
      const textY = footerY - 20;
      svgText += `<text x="${textX}" y="${textY}" text-anchor="end" font-size="40" font-weight="600" font-family="SF Pro Display, -apple-system, system-ui" fill="#0f172a">${soberTime} sober</text>`;
    }
  } else {
    // Existing QR code logic
    const footerYqr = footerY;
    const meetingUrl = id ? `https://gskis.com/meeting/${encodeURIComponent(id)}` : 'https://gskis.com/meeting';
    const qr = QRCode(0, 'L');
    qr.addData(meetingUrl);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const qrRenderSize = 140;
    const cellSize = qrRenderSize / moduleCount;
    let qrSvgParts = '';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          const x = c * cellSize;
          const yq = r * cellSize;
          qrSvgParts += `<rect x="${x.toFixed(2)}" y="${yq.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#0f172a"/>`;
        }
      }
    }
    const qrX = WIDTH - 60 - 140;
    const qrY = footerYqr - 140;
    svgText += `<g aria-label="QR code" role="img" transform="translate(${qrX},${qrY})">${qrSvgParts}</g>`;
  }

  svgText += `<g>\n    <text x="${startX}" y="${footerY}" font-size="34" font-weight="600" font-family="SF Pro Display, -apple-system, system-ui" fill="#334155">MyMeetings</text>\n  </g>`;
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg width=\"${WIDTH}\" height=\"${HEIGHT}\" viewBox=\"0 0 ${WIDTH} ${HEIGHT}\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"${title}\">\n  <defs>\n    <linearGradient id=\"gPlain\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop stop-color=\"#ecfdf5\" offset=\"0%\" />\n      <stop stop-color=\"#d1fae5\" offset=\"50%\" />\n      <stop stop-color=\"#bfdbfe\" offset=\"100%\" />\n    </linearGradient>\n  </defs>\n  <rect fill=\"url(#gPlain)\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" />\n  ${svgText}\n</svg>`;
}

export const prerender = false;