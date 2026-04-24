(function(){
  'use strict';
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';
  var partners=window.WV_PARTNERS||[];
  var defaultPartner=partners.length?partners[0].number:'254705040033';
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
