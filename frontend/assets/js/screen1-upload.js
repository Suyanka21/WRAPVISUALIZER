(function(){
  'use strict';
  // API base is the same origin that served this page — the backend
  // hosts the frontend as static assets, so relative '/api/*' URLs
  // work in every environment (local dev, Railway, Fly, etc.).
  var API='';
  var VMAP={
    'Toyota Land Cruiser V8/LC300':'land_cruiser_v8',
    'Range Rover Vogue':'range_rover_vogue',
    'Lexus LX600':'lexus_lx600',
    'Toyota Land Cruiser Prado':'prado',
    'Mercedes-Benz GLE':'mercedes_gle',
    'BMW 7 Series':'bmw_7_series',
    'Subaru Outback':'subaru_outback'
  };
  var fileInput=document.getElementById('wv-file-input');
  var uploadPrompt=document.getElementById('wv-upload-prompt');
  var initBtn=document.getElementById('wv-init-btn');
  var selectedFile=null,selVehicleId=null,selVehicleLabel=null,selVehicleImg=null;
  // Default vehicle image for the "Initialize Customizer" fallback path.
  var DEFAULT_VEHICLE_IMG='assets/vehicles/land_cruiser_v8.jpg';

  // Read an uploaded file as a data URL so the chosen photo can persist
  // across screens via sessionStorage. Resolves to null on quota or IO
  // errors so the flow continues with the default/template image.
  // Enforces the same 10 MB cap as the backend so oversized files never
  // get base64-inflated (~1.35x) into memory and sessionStorage.
  var MAX_UPLOAD_BYTES=10*1024*1024;
  function readFileAsDataUrl(file){
    return new Promise(function(resolve){
      if(!file||file.size>MAX_UPLOAD_BYTES){ resolve(null); return; }
      try{
        var r=new FileReader();
        r.onload=function(){resolve(r.result);};
        r.onerror=function(){resolve(null);};
        r.readAsDataURL(file);
      }catch(_e){ resolve(null); }
    });
  }

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  fileInput.addEventListener('change',function(e){
    var f=e.target.files[0]; if(!f) return;
    selectedFile=f;
    var iconEl=uploadPrompt.querySelector('.material-symbols-outlined');
    var textEl=uploadPrompt.querySelector('.font-headline');
    var hintEl=uploadPrompt.querySelectorAll('.text-xs');
    if(iconEl) iconEl.textContent='check_circle';
    if(textEl) textEl.textContent=f.name;
    if(hintEl.length) hintEl[hintEl.length-1].textContent='Ready to customize';
  });

  var templateCards=document.querySelectorAll('.template-card');
  templateCards.forEach(function(card){
    card.addEventListener('click',function(){
      var label=card.getAttribute('data-vehicle');
      var vid=VMAP[label]; if(!vid) return;
      var img=card.getAttribute('data-vehicle-img')||DEFAULT_VEHICLE_IMG;
      selVehicleId=vid; selVehicleLabel=label; selVehicleImg=img;
      templateCards.forEach(function(c){c.classList.remove('selected');});
      card.classList.add('selected');
      sessionStorage.setItem('wv_vehicle_id',vid);
      sessionStorage.setItem('wv_vehicle_label',label);
      sessionStorage.setItem('wv_vehicle_image',img);
      // Template cards carry a known asset, not a user upload — clear any
      // stale uploaded photo from a previous session so screen2 doesn't mix them.
      sessionStorage.removeItem('wv_vehicle_image_uploaded');
      setTimeout(function(){window.location.href='screen2-studio.html';},400);
    });
  });

  initBtn.addEventListener('click',async function(){
    if(!selVehicleId&&!selectedFile){
      selVehicleId='land_cruiser_v8';
      selVehicleLabel='Toyota Land Cruiser V8/LC300';
      selVehicleImg=DEFAULT_VEHICLE_IMG;
    }
    if(selVehicleId){
      sessionStorage.setItem('wv_vehicle_id',selVehicleId);
      sessionStorage.setItem('wv_vehicle_label',selVehicleLabel);
      if(selVehicleImg) sessionStorage.setItem('wv_vehicle_image',selVehicleImg);
      // Template/default path: this is a known asset, not a user upload.
      // Clear any stale uploaded flag from a previous session.
      sessionStorage.removeItem('wv_vehicle_image_uploaded');
    }
    if(selectedFile){
      // Upload path: user-supplied photo takes precedence over any template
      // id that may have been selected earlier in the same session.
      sessionStorage.removeItem('wv_vehicle_id');
      sessionStorage.removeItem('wv_vehicle_image_uploaded');
      sessionStorage.setItem('wv_vehicle_label',selVehicleLabel||'Your vehicle');
      initBtn.querySelector('span:first-child').textContent='Processing...';
      initBtn.style.pointerEvents='none'; initBtn.style.opacity='0.6';
      // Persist the user-uploaded photo so screen2 can preview it. sessionStorage
      // is capped (~5 MB in most browsers); wrap in try/catch so an over-size
      // upload doesn't block navigation.
      var uploadDataUrl=await readFileAsDataUrl(selectedFile);
      if(uploadDataUrl){
        try{
          sessionStorage.setItem('wv_vehicle_image',uploadDataUrl);
          sessionStorage.setItem('wv_vehicle_image_uploaded','true');
        }catch(_quota){ console.warn('[WV] Upload preview too large to persist'); }
      }
      // Clear any stale mask from a previous upload so screen2 never
      // renders a segmentation result that belongs to a different photo.
      sessionStorage.removeItem('wv_segmented_image');
      try{
        var fd=new FormData(); fd.append('image',selectedFile);
        var res=await fetch(API+'/api/segment',{method:'POST',body:fd});
        var data=await res.json();
        if(data.success&&data.segmented_image){
          sessionStorage.setItem('wv_segmented_image',data.segmented_image);
        }
      }catch(err){ console.warn('[WV] Segmentation skipped:',err.message); }
    }
    window.location.href='screen2-studio.html';
  });

  var teaserPartners={'wv-teaser-wa1':'254705040033','wv-teaser-wa2':'254700419444'};
  Object.keys(teaserPartners).forEach(function(id){
    var btn=document.getElementById(id);
    if(btn) btn.addEventListener('click',function(){
      var v=selVehicleLabel||'General Inquiry';
      var msg=encodeURIComponent('Hi, I am interested in a vehicle wrap.\nVehicle: '+v+'\n\nCould you share options and next steps?');
      window.open('https://wa.me/'+teaserPartners[id]+'?text='+msg,'_blank');
    });
  });
})();
