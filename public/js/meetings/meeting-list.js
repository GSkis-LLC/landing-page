// Meeting list client: reads #initial-meetings JSON and updates #meeting-list on filters-changed
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

  const typeToClass = {
    'Beginner': 'type-badge-beginner',
    'Big Book': 'type-badge-bigbook',
    'Closed': 'type-badge-closed',
    'Discussion': 'type-badge-discussion',
    'English': 'type-badge-english',
    'Grapevine': 'type-badge-grapevine',
    'Literature': 'type-badge-literature',
    'Men': 'type-badge-men',
    'Open': 'type-badge-open',
    'Step': 'type-badge-step',
    'Speaker': 'type-badge-speaker',
    'Step/Tradition': 'type-badge-steptradition',
    'Tradition': 'type-badge-tradition',
    'Women': 'type-badge-women',
    'Wheelchair Access': 'type-badge-wheelchair',
    'Young People': 'type-badge-youngpeople',
  };

  let allMeetings = [];

  function readInitial() {
    try {
      const dataEl = document.getElementById('initial-meetings');
      allMeetings = JSON.parse(dataEl?.textContent || '[]') || [];
    } catch (e) {
      console.error('Failed to parse initial meetings', e);
      allMeetings = [];
    }
  }

  function renderList(meetings) {
    const listEl = document.getElementById('meeting-list');
    const countEl = document.getElementById('results-count');
    if (countEl) countEl.textContent = `${meetings.length} meetings found`;

    if (!listEl) return;
    if (meetings.length === 0) {
      listEl.innerHTML = `\n        <div class="no-results">\n          <div class="no-results-icon">📍</div>\n          <p>No meetings found. Please try adjusting your filters.</p>\n        </div>\n      `;
      return;
    }

    listEl.innerHTML = meetings.slice(0, 50).map(m => {
      const types = m.types ? String(m.types).split(',').map(t => t.trim()).filter(Boolean) : [];
      const typeBadges = types.map(t => `<span class="type-badge ${typeToClass[t] || ''}">${t}</span>`).join('');
      const displayDay = m.display_day || (m.day != null ? dayOfWeek(m.day) : '');
      const displayTime = m.display_time || (m.time ? formatTime(m.time) : '');
      const displayAddress = m.display_address || m.formatted_address || m.location || m.address || '';

      const actionsHtml = (m.latitude && m.longitude) ? `\n        <div class="meeting-actions">\n          <a class="btn-small" href="http://maps.apple.com/?daddr=${m.latitude},${m.longitude}" target="_blank" rel="noopener noreferrer">\n            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>\n            Directions\n          </a>\n        </div>\n      ` : '';

      return `\n        <div class="meeting-card">\n          <h3 class="meeting-name">${m.name || 'Unnamed Meeting'}</h3>\n          <div class="meeting-info">\n            <span class="meeting-info-item">\n              <svg width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z\" /></svg>\n              ${displayDay}\n            </span>\n            <span class="meeting-info-item">\n              <svg width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z\" /></svg>\n              ${displayTime}\n            </span>\n          </div>\n          ${displayAddress ? `<div class=\"meeting-address\"><svg style=\"display:inline;width:14px;height:14px;vertical-align:-2px;margin-right:4px;\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z\" /><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15 11a3 3 0 11-6 0 3 3 0 016 0z\" /></svg>${displayAddress}</div>` : ''}
          ${typeBadges ? `<div class=\"meeting-types\">${typeBadges}</div>` : ''}
          ${actionsHtml}
        </div>\n      `;
    }).join('');
  }

  function applyFilters(detail) {
    const { day, time, type } = detail || {};
    const filtered = allMeetings.filter(m => {
      if (day && String(m.day) !== day) return false;
      if (time && getTimeOfDay(m.time) !== time) return false;
      if (type) {
        const types = m.types ? String(m.types).toLowerCase() : '';
        if (!types.includes(type.toLowerCase())) return false;
      }
      return true;
    });
    renderList(filtered);
    // Also notify map to update via same event (map listens separately)
  }

  function init() {
    readInitial();
    renderList(allMeetings);
    window.addEventListener('filters-changed', function (e) {
      applyFilters(e.detail || {});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
