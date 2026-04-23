(function(){
  'use strict';

  // ─── Single source of truth for partner WhatsApp numbers ──────
  // Every screen loads this file before its own script, so all
  // WhatsApp links and JS handlers read from the same array.
  // To change a partner, edit this one file.
  window.WV_PARTNERS = [
    { id: 'wa1', number: '254705040033', display: '+254 705 040 033', label: 'Line 1' },
    { id: 'wa2', number: '254700419444', display: '+254 700 419 444', label: 'Line 2' },
  ];

  // Hydrate all menu-overlay WhatsApp links. Each screen's overlay
  // contains a container with id="wv-partner-links" that this script
  // fills. If the container is missing (shouldn't be), silently skip.
  var container = document.getElementById('wv-partner-links');
  if (container) {
    container.innerHTML = '';
    window.WV_PARTNERS.forEach(function(p) {
      var a = document.createElement('a');
      a.href = 'https://wa.me/' + p.number;
      a.target = '_blank';
      a.className = 'flex items-center gap-3 py-3 px-4 bg-secondary-container/10 border border-secondary-container/20 text-secondary text-sm font-bold';
      a.innerHTML =
        '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' 1;">chat</span>' +
        p.display;
      container.appendChild(a);
    });
  }
})();
