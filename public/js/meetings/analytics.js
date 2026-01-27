// Analytics client: attach CTA and filter tracking; tries to call window.mixpanel.track or console.log
(function () {
  function track(eventName, props) {
    try {
      if (window.mixpanel && typeof window.mixpanel.track === 'function') {
        window.mixpanel.track(eventName, props);
      } else if (window.track && typeof window.track === 'function') {
        window.track(eventName, props);
      } else {
        console.debug('Analytics:', eventName, props);
      }
    } catch (e) {
      console.warn('Analytics track failed', e);
    }
  }

  function init() {
    // CTA buttons
    const ctaButtons = document.querySelectorAll('.cta-button, .cta-button-large, .cta-button-hero, .sticky-cta-button');
    ctaButtons.forEach(function(btn, index) {
      btn.addEventListener('click', function () {
        try {
          let location = 'unknown';
          if (btn.classList.contains('sticky-cta-button')) location = 'sticky_mobile';
          else if (btn.classList.contains('cta-button-hero')) location = 'final_cta';
          else if (btn.classList.contains('cta-button-large')) location = 'app_promo_banner';
          else if (btn.classList.contains('cta-button')) location = 'header';
          track('App Download Click', {
            page: window.location.pathname,
            button_location: location,
            button_index: index,
            url: window.location.href,
            referrer: document.referrer || 'direct'
          });
        } catch (e) { console.warn(e); }
      });
    });

    // Scroll depth (coarse)
    let maxScroll = 0;
    const trackScrollDepth = function() {
      const scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
      if (scrollPercent > maxScroll && scrollPercent % 25 === 0) {
        maxScroll = scrollPercent;
        track('Scroll Depth', { page: window.location.pathname, depth: scrollPercent });
      }
    };
    window.addEventListener('scroll', trackScrollDepth, { passive: true });

    // Filters
    window.addEventListener('filters-changed', function (e) {
      const d = e.detail || {};
      track('Filter Used', { page: window.location.pathname, filter_type: Object.keys(d).join(','), filter_value: JSON.stringify(d) });
    });

    // Engaged user
    setTimeout(function() { track('Engaged User', { page: window.location.pathname, time_on_page: '30s' }); }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
