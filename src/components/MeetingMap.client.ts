import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function escapeHtml(s: any) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

(function init() {
  if (typeof window === 'undefined') return;
  const el = document.getElementById('meeting-map');
  if (!el) return;

  const dataEl = document.getElementById('initial-meetings');
  let meetings: any[] = [];
  try {
    const raw = dataEl?.textContent || '[]';
    meetings = JSON.parse(raw || '[]');
    if (meetings && (meetings as any).meetings) meetings = (meetings as any).meetings;
  } catch (err) {
    console.error('Failed to parse meetings JSON', err);
    meetings = [];
  }

  const lat = parseFloat(el.getAttribute('data-lat') || '42.3601');
  const lng = parseFloat(el.getAttribute('data-lng') || '-71.0589');

  const map = L.map(el as HTMLElement).setView([lat, lng], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CartoDB',
  }).addTo(map);

  meetings.forEach((m: any) => {
    const ml = parseFloat(m.latitude || m.lat || '');
    const mg = parseFloat(m.longitude || m.lng || '');
    if (!Number.isFinite(ml) || !Number.isFinite(mg)) return;
    const marker = L.marker([ml, mg]).addTo(map);
    const popup = `<strong>${escapeHtml(m.name || 'Meeting')}</strong><br/>${escapeHtml(
      m.formatted_address || m.location || m.address || ''
    )}`;
    marker.bindPopup(popup);
  });
})();
