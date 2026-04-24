(function(){
  'use strict';
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';
  var partners=window.WV_PARTNERS||[];
  var defaultPartner=partners.length?partners[0].number:'254705040033';
  var partner=sessionStorage.getItem('wv_wa_partner')||defaultPartner;
  var track=window.wvTrack||function(){};

  // Fires once per visit to screen4 so the lead-gen funnel's
  // "conversion" event is observable in the /api/events stream.
  track('inquiry_sent',{partner:partner});

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
