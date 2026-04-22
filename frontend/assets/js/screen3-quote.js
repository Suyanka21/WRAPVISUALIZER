(function(){
  'use strict';
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';
  var colorHex=sessionStorage.getItem('wv_color_hex')||'#0a0a0a';
  var vision=(sessionStorage.getItem('wv_vision')||'').trim();

  document.getElementById('wv-q-vehicle').textContent=vehicleLabel;
  document.getElementById('wv-q-finish').textContent=finish;
  document.getElementById('wv-q-color').textContent=color;
  document.getElementById('wv-q-color-dot').style.background=colorHex;

  if(vision){
    document.getElementById('wv-q-notes').textContent=vision;
    document.getElementById('wv-notes-section').style.display='block';
  }

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  // Build the WhatsApp pre-filled message. No prices — the shop replies
  // with the tailored quote over chat. Keep notes short so the wa.me URL
  // stays under the ~2 KB limit some Android builds enforce.
  function buildMsg(){
    var lines=[
      'Hi, I would like a wrap quote for my vehicle.',
      'Vehicle: '+vehicleLabel,
      'Finish: '+finish,
      'Color: '+color
    ];
    if(vision){
      var trimmed=vision.length>400?vision.slice(0,400)+'…':vision;
      lines.push('Notes: '+trimmed);
    }
    lines.push('');
    lines.push('Could you share a tailored quote and next steps?');
    return encodeURIComponent(lines.join('\n'));
  }

  var partners={'wv-wa1':'254705040033','wv-wa2':'254700419444'};
  Object.keys(partners).forEach(function(id){
    var btn=document.getElementById(id);
    if(!btn) return;
    btn.addEventListener('click',function(){
      sessionStorage.setItem('wv_wa_sent','true');
      sessionStorage.setItem('wv_wa_partner',partners[id]);
      window.open('https://wa.me/'+partners[id]+'?text='+buildMsg(),'_blank','noopener');
      setTimeout(function(){window.location.href='screen4-confirmation.html';},800);
    });
  });
})();
