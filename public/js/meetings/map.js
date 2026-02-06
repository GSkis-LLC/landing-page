// Map client: initialize Leaflet map, render markers, and respond to 'filters-changed'
(function () {
  function formatTime(t) {
    if (!t) return '';
    const parts = String(t).split(':');
    if (parts.length < 2) return t;
    const hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${minute} ${ampm}`;
  }

  function dayOfWeek(num) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[(Number(num) || 0)];
  }

  function getTimeOfDay(timeStr) {
    if (!timeStr) return null;
    const parts = String(timeStr).split(':');
    const hour = parseInt(parts[0], 10);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  let allMeetings = [];
  let map = null;
  let markers = [];

  function readInitial() {
    try {
      const dataEl = document.getElementById('initial-meetings');
      allMeetings = JSON.parse(dataEl?.textContent || '[]') || [];
    } catch (e) {
      console.error('Failed to parse initial meetings', e);
      allMeetings = [];
    }
  }

  function clearMarkers() {
    markers.forEach(m => { try { map.removeLayer(m); } catch(e) {} });
    markers = [];
  }

  function renderMarkers(meetings) {
    if (!map) return;
    clearMarkers();
    meetings.forEach(m => {
      const lat = m.latitude != null ? Number(m.latitude) : (m.lat != null ? Number(m.lat) : null);
      const lng = m.longitude != null ? Number(m.longitude) : (m.lng != null ? Number(m.lng) : null);
      if (!isFinite(lat) || !isFinite(lng)) return;

      const displayDay = m.display_day || (m.day != null ? dayOfWeek(m.day) : '');
      const displayTime = m.display_time || (m.time ? formatTime(m.time) : '');
      const displayAddress = m.display_address || m.formatted_address || m.location || m.address || '';

      const popupParts = [];
      if (m.name) popupParts.push(`<strong>${String(m.name)}</strong>`);
      if (displayAddress) popupParts.push(displayAddress);
      if (displayTime) popupParts.push(`${displayTime}${displayDay ? ` • ${displayDay}` : ''}`);

      try {
        const marker = L.marker([lat, lng]).addTo(map).bindPopup(popupParts.join('<br/>'));
        markers.push(marker);
      } catch (e) {
        // Leaflet may not be loaded yet or map not initialized
      }
    });
  }

  function applyFilters(detail) {
    const { day, time, type, format } = detail || {};
    const filtered = allMeetings.filter(m => {
      if (day && String(m.day) !== day) return false;
      if (time && getTimeOfDay(m.time) !== time) return false;
      if (type) {
        const types = m.types ? String(m.types).toLowerCase() : '';
        if (!types.includes(type.toLowerCase())) return false;
      }
      if (format) {
        if (format === 'online' && !m.conference_url) return false;
        if (format === 'in-person' && m.conference_url) return false;
      }
      return true;
    });
    renderMarkers(filtered);
  }

  function initMap() {
    const mapEl = document.getElementById('meeting-map');
    if (!mapEl) return;
    const lat = parseFloat(mapEl?.dataset.lat || '42.3601');
    const lng = parseFloat(mapEl?.dataset.lng || '-71.0589');
    try {
      map = L.map('meeting-map').setView([lat, lng], 12);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CartoDB'
      }).addTo(map);
    } catch (e) {
      console.error('Leaflet init failed', e);
    }
    renderMarkers(allMeetings);
  }

  function init() {
    readInitial();
    // Wait for L to be available
    function tryInit() {
      if (typeof L === 'undefined') {
        setTimeout(tryInit, 150);
        return;
      }
      initMap();
      window.addEventListener('filters-changed', function (e) {
        applyFilters(e.detail || {});
      });
    }
    tryInit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
