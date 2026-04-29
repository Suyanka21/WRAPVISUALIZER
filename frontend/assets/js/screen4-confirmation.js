(function(){
  'use strict';

  // Funnel-state guard. Screen 4 is the post-handoff confirmation; it
  // is only meaningful if the user actually completed screens 1–3.
  // A direct visit, refresh after the session was cleared, or a stale
  // bookmark would otherwise render the page with placeholder vehicle
  // info and let the user re-trigger a WhatsApp message they never
  // sent. wv_vehicle_label is the same funnel marker screen 3 checks.
  if (!sessionStorage.getItem('wv_vehicle_label')) {
    window.location.replace('screen1-upload.html');
    return;
  }

  // Same fallback rationale as screen3-quote.js: if partners.js failed
  // to load, we still need a viable WhatsApp number so the "Chat again"
  // CTA isn't dead. partners.js remains the source of truth.
  var WV_PARTNERS_FALLBACK=[
    {id:'wa1',number:'254705040033',display:'+254 705 040 033',label:'Line 1'},
    {id:'wa2',number:'254700419444',display:'+254 700 419 444',label:'Line 2'}
  ];

  // Shared validator (loaded by partners-validate.js, which every screen
  // includes BEFORE its own script). Hard-fail to fallback if the validator
  // module is somehow missing — same outcome as an all-malformed list.
  var validator=window.WV_PARTNER_VALIDATE||{};
  var normalizePartnerNumber=validator.normalizePartnerNumber||function(){return null;};

  // Audit V1 whitelist (kept in sync with screen3-quote.js / screen2-studio.html).
  var ALLOWED_FINISHES=[
    'Matte','Gloss','Satin','Chrome','Carbon Fibre',
    'Brushed Metal','Colour Shift','PPF Clear'
  ];
  var ALLOWED_COLORS=[
    'Black','White','Racing Red','Midnight Blue','British Racing Green',
    'Sunset Orange','Gold','Tiffany Blue','Nardo Gray','Gunmetal',
    'Espresso Brown','Purple Reign'
  ];
  function pickAllowed(value, allowed, fallback){
    return allowed.indexOf(value)>=0 ? value : fallback;
  }

  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=pickAllowed(sessionStorage.getItem('wv_finish'),ALLOWED_FINISHES,'Matte');
  var color=pickAllowed(sessionStorage.getItem('wv_color'),ALLOWED_COLORS,'Black');

  // Sanitize the external partner list through the shared validator.
  // An array with a present-but-malformed entry (e.g. {} or
  // {number:'abc'}) used to slip past the `&&.length` guard and produce
  // defaultPartner=undefined, which would build https://wa.me/undefined
  // — a dead conversion link.
  var sanitized=(typeof validator.validatePartners==='function')
    ? validator.validatePartners(window.WV_PARTNERS)
    : [];
  var partners=sanitized.length?sanitized:WV_PARTNERS_FALLBACK;
  if(!sanitized.length){
    console.warn('[WV] partners.js missing, empty, or all entries invalid; using inline fallback on screen 4');
  }
  var defaultPartner=partners[0].number;

  // sessionStorage may carry a partner from an older build or a
  // tampered tab. Re-validate it against the same normalizer; only
  // fall back if it's good and present in the sanitized partner list.
  var storedPartner=normalizePartnerNumber(sessionStorage.getItem('wv_wa_partner'));
  var partner=(storedPartner&&partners.some(function(p){return p.number===storedPartner;}))
    ? storedPartner
    : defaultPartner;
  var track=window.wvTrack||function(){};

  // Fire the conversion event only when the user actually arrived
  // here via screen3's gated handoff (visibilitychange within 3 s of
  // the WhatsApp click). A refresh, back-navigation, or direct URL
  // visit to this screen must NOT inflate the funnel, so we consume
  // and clear the one-shot flag.
  if(sessionStorage.getItem('wv_wa_sent')==='true'){
    sessionStorage.removeItem('wv_wa_sent');
    track('inquiry_sent',{partner:partner});
  }

  document.getElementById('wv-c-vehicle').textContent=vehicleLabel;
  document.getElementById('wv-c-finish').textContent=finish;
  document.getElementById('wv-c-color').textContent=color;

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  var waAgainBtn=document.getElementById('wv-wa-again');
  if(waAgainBtn){
    waAgainBtn.addEventListener('click',function(){
      track('wa_reopen',{screen:'screen4',partner:partner});
      // partner is guaranteed to match /^2547\d{8}$/ by the validator
      // above, so encodeURIComponent is a no-op on success — but it's
      // a defense-in-depth guard against any future code path that
      // could let unsafe data reach this URL builder.
      window.open('https://wa.me/'+encodeURIComponent(partner),'_blank','noopener');
    });
  }
})();
