(function(){
  'use strict';
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';
  var partner=sessionStorage.getItem('wv_wa_partner')||'254705040033';

  document.getElementById('wv-c-vehicle').textContent=vehicleLabel;
  document.getElementById('wv-c-finish').textContent=finish;
  document.getElementById('wv-c-color').textContent=color;

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  document.getElementById('wv-wa-again').addEventListener('click',function(){
    window.open('https://wa.me/'+partner,'_blank');
  });
})();
