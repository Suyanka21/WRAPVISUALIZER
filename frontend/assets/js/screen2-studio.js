(function(){
  'use strict';

  // Funnel-state guard. Screen 2 only makes sense after the user
  // selects a vehicle or uploads a photo on screen 1. A direct URL
  // visit, refresh after sessionStorage was cleared (iOS Safari
  // Private), or a stale bookmark would render the studio with a
  // default placeholder vehicle and let the user fire a meaningless
  // WhatsApp lead. wv_vehicle_label is set on every legitimate entry
  // path through screen 1, so its absence is a reliable "you skipped
  // the funnel" signal. Matches screens 3 and 4.
  if (!sessionStorage.getItem('wv_vehicle_label')) {
    window.location.replace('screen1-upload.html');
    return;
  }

  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Toyota Land Cruiser V8/LC300';
  document.getElementById('wv-vehicle-name').textContent=vehicleLabel;
  document.getElementById('wv-sum-vehicle').textContent=vehicleLabel;

  // Non-blocking banner: screen1 sets `wv_segment_error` when /api/segment
  // fails so the user knows the AI step didn't run. Reading the flag here
  // clears it so a later revisit to screen2 doesn't re-show it.
  var segErrEl=document.getElementById('wv-segment-error');
  if(segErrEl){
    var segErr=sessionStorage.getItem('wv_segment_error');
    if(segErr){
      var segErrMsg=document.getElementById('wv-segment-error-msg');
      // Audit SF2: previously the message was silently dropped if the
      // backend returned a >200-char string (e.g. a verbose Replicate
      // detail in dev mode). Truncate-and-show is more honest — the
      // user gets something to read, ops still see the full message
      // upstream, and 200 chars is a sensible UI cap on a 375px banner.
      if(segErrMsg){
        segErrMsg.textContent=segErr.length>200
          ? segErr.slice(0,197)+'...'
          : segErr;
      }
      segErrEl.classList.remove('hidden');
      sessionStorage.removeItem('wv_segment_error');
    }
    var segErrClose=document.getElementById('wv-segment-error-close');
    if(segErrClose){
      segErrClose.addEventListener('click',function(){ segErrEl.classList.add('hidden'); });
    }
  }

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

  // Finish buttons. UI Phase A: also flip data-finish on the studio
  // preview <img> so the per-finish CSS filter (.wv-finish-filter
  // [data-finish=...]) updates the preview the user sees. Cheap
  // illusion that signals "your finish is being applied" without
  // requiring a real per-finish render set.
  var finishBtns=document.querySelectorAll('.finish-btn');
  var studioPreview=document.getElementById('wv-studio-preview');
  finishBtns.forEach(function(btn){
    btn.addEventListener('click',function(){
      finishBtns.forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      selFinish=btn.getAttribute('data-finish');
      document.getElementById('wv-finish-badge').textContent=selFinish;
      document.getElementById('wv-sum-finish').textContent=selFinish;
      if(studioPreview){ studioPreview.setAttribute('data-finish',selFinish); }
    });
  });

  // Color swatches. UI Phase A: also updates the live mono caption
  // beneath the swatch row (#wv-color-caption-name / #wv-color-caption-hex)
  // so the user sees an authoritative spec for what they just picked
  // without having to scroll back up to the canvas badge.
  var swatches=document.querySelectorAll('.swatch');
  var captionName=document.getElementById('wv-color-caption-name');
  var captionHex=document.getElementById('wv-color-caption-hex');
  swatches.forEach(function(sw){
    sw.addEventListener('click',function(){
      swatches.forEach(function(s){s.classList.remove('active');});
      sw.classList.add('active');
      selColor=sw.getAttribute('data-color');
      selHex=sw.getAttribute('data-hex');
      document.getElementById('wv-color-badge').textContent=selColor;
      document.getElementById('wv-sum-color').textContent=selColor;
      if(captionName) captionName.textContent=selColor;
      if(captionHex) captionHex.textContent=selHex;
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
