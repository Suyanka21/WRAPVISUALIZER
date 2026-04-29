(function(){
  'use strict';

  // ─── Single source of truth for partner WhatsApp numbers ──────
  // Every screen loads this file before its own script, so all
  // WhatsApp links and JS handlers read from the same array.
  // To change a partner, edit this one file.
  //
  // Entries are passed through WV_PARTNER_VALIDATE.validatePartners
  // (loaded by partners-validate.js, which every screen includes
  // BEFORE this file) so malformed edits (missing number, bad shape)
  // are filtered out before any wa.me URL is built. If every entry
  // fails validation, WV_PARTNERS is left empty and the per-screen
  // WV_PARTNERS_FALLBACK takes over — no dead wa.me/undefined links
  // can ever reach a user.
  var RAW_PARTNERS = [
    { id: 'wa1', number: '254705040033', display: '+254 705 040 033', label: 'Line 1' },
    { id: 'wa2', number: '254700419444', display: '+254 700 419 444', label: 'Line 2' },
  ];
  var validator = window.WV_PARTNER_VALIDATE;
  window.WV_PARTNERS = validator && typeof validator.validatePartners === 'function'
    ? validator.validatePartners(RAW_PARTNERS)
    : RAW_PARTNERS;
  if (validator && window.WV_PARTNERS.length !== RAW_PARTNERS.length) {
    console.warn(
      '[WV] partners.js: '+(RAW_PARTNERS.length-window.WV_PARTNERS.length)+
      ' raw partner entries failed validation and were dropped.'
    );
  }

  // Hydrate all menu-overlay WhatsApp links. Each screen's overlay
  // contains a container with id="wv-partner-links" that this script
  // fills. If the container is missing (shouldn't be), silently skip.
  var container = document.getElementById('wv-partner-links');
  if (container) {
    container.innerHTML = '';
    window.WV_PARTNERS.forEach(function(p) {
      var a = document.createElement('a');
      // p.number is guaranteed /^2547\d{8}$/ by the validator above,
      // so encodeURIComponent is a no-op on success — kept as
      // defense-in-depth against any future bypass of validation.
      a.href = 'https://wa.me/' + encodeURIComponent(p.number);
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'flex items-center gap-3 py-3 px-4 bg-secondary-container/10 border border-secondary-container/20 text-secondary text-sm font-bold';
      a.innerHTML =
        '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' 1;">chat</span>' +
        p.display;
      container.appendChild(a);
    });
  }
})();
