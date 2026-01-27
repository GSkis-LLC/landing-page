// Filters client: emits 'filters-changed' CustomEvent with {day,time,type}
(function () {
  function emit() {
    const day = document.getElementById('filter-day')?.value || '';
    const time = document.getElementById('filter-time')?.value || '';
    const type = document.getElementById('filter-type')?.value || '';
    window.dispatchEvent(new CustomEvent('filters-changed', { detail: { day, time, type } }));
  }

  function init() {
    const ids = ['filter-day', 'filter-time', 'filter-type'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', function () {
        emit();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
