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

  // Coerce any of the three Kenyan phone formats accepted by GEMINI.md
  // rule #4 (07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX) into the canonical
  // wa.me/2547XXXXXXXX form (rule #5). Returns null if the input cannot
  // be confidently normalized — callers must fall back when null.
  function normalizePartnerNumber(raw){
    if(raw==null) return null;
    var digits=String(raw).replace(/\D/g,'');
    if(/^07\d{8}$/.test(digits)) return '254'+digits.slice(1);
    if(/^7\d{8}$/.test(digits))  return '254'+digits;
    if(/^2547\d{8}$/.test(digits)) return digits;
    return null;
  }

  // Validate one entry from window.WV_PARTNERS. Drops entries that
  // aren't a plain object or don't carry a normalizable phone number.
  // Returns a sanitized partner with safe-to-render display/label.
  function validatePartner(p){
    if(!p||typeof p!=='object') return null;
    var number=normalizePartnerNumber(p.number);
    if(!number) return null;
    return {
      id: typeof p.id==='string'&&p.id?p.id:'wa-'+number,
      number: number,
      display: typeof p.display==='string'&&p.display?p.display:'+'+number,
      label: typeof p.label==='string'&&p.label?p.label:'WhatsApp'
    };
  }

  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';

  // Sanitize the external partner list. An array with a present-but-
  // malformed entry (e.g. {} or {number:'abc'}) used to slip past the
  // `&&.length` guard and produce defaultPartner=undefined, which
  // would build https://wa.me/undefined — a dead conversion link.
  var rawPartners=Array.isArray(window.WV_PARTNERS)?window.WV_PARTNERS:[];
  var sanitized=rawPartners.map(validatePartner).filter(Boolean);
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
