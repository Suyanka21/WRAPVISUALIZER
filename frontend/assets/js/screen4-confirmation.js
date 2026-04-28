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
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';
  var hasPartnerList=Array.isArray(window.WV_PARTNERS)&&window.WV_PARTNERS.length>0;
  var partners=hasPartnerList?window.WV_PARTNERS:WV_PARTNERS_FALLBACK;
  if(!hasPartnerList){
    console.warn('[WV] partners.js missing or empty; using inline fallback on screen 4');
  }
  var defaultPartner=partners[0].number;
  var partner=sessionStorage.getItem('wv_wa_partner')||defaultPartner;
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
      window.open('https://wa.me/'+partner,'_blank','noopener');
    });
  }
})();
