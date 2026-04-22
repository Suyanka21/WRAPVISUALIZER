(function(){
  'use strict';
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Toyota Land Cruiser V8/LC300';
  document.getElementById('wv-vehicle-name').textContent=vehicleLabel;
  document.getElementById('wv-sum-vehicle').textContent=vehicleLabel;

  // Render the vehicle image that was picked on screen1 (template asset
  // path or uploaded-photo data URL). Keep the hardcoded src as a visual
  // fallback so the preview is never empty if sessionStorage is cleared.
  var vehicleImg=sessionStorage.getItem('wv_vehicle_image');
  if(vehicleImg){
    var previewEl=document.getElementById('wv-studio-preview');
    if(previewEl){
      previewEl.src=vehicleImg;
      previewEl.alt=vehicleLabel+' preview';
    }
  }

  var selFinish='Matte', selColor='Black', selHex='#0a0a0a';

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  // Finish buttons
  var finishBtns=document.querySelectorAll('.finish-btn');
  finishBtns.forEach(function(btn){
    btn.addEventListener('click',function(){
      finishBtns.forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      selFinish=btn.getAttribute('data-finish');
      document.getElementById('wv-finish-badge').textContent=selFinish;
      document.getElementById('wv-sum-finish').textContent=selFinish;
    });
  });

  // Color swatches
  var swatches=document.querySelectorAll('.swatch');
  swatches.forEach(function(sw){
    sw.addEventListener('click',function(){
      swatches.forEach(function(s){s.classList.remove('active');});
      sw.classList.add('active');
      selColor=sw.getAttribute('data-color');
      selHex=sw.getAttribute('data-hex');
      document.getElementById('wv-color-badge').textContent=selColor;
      document.getElementById('wv-sum-color').textContent=selColor;
    });
  });

  // Advance to review/send screen — no pricing is computed or requested.
  document.getElementById('wv-get-quote').addEventListener('click',function(){
    sessionStorage.setItem('wv_finish',selFinish);
    sessionStorage.setItem('wv_color',selColor);
    sessionStorage.setItem('wv_color_hex',selHex);
    sessionStorage.setItem('wv_vision',document.getElementById('wv-vision').value||'');
    window.location.href='screen3-quote.html';
  });
})();
