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

  // -----------------------------------------------------------------------
  // Color overlay engine — uses SAM-2 masks to tint vehicle body panels
  // -----------------------------------------------------------------------

  var selFinish='Matte', selColor='Black', selHex='#0a0a0a';

  // Canvas + mask state
  var canvas = document.getElementById('wv-color-overlay');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var maskImg = null;       // Image object holding the loaded mask
  var maskReady = false;    // true once the mask is drawn and usable
  var maskLoading = document.getElementById('wv-mask-loading');
  var studioPreview = document.getElementById('wv-studio-preview');

  // Opacity map per finish type — controls how strongly the color shows
  var FINISH_OPACITY = {
    'Matte':        0.55,
    'Gloss':        0.50,
    'Satin':        0.48,
    'Chrome':       0.35,
    'Colour Shift': 0.45,
    'Carbon Fibre': 0.40,
    'Brushed Metal':0.35,
    'PPF Clear':    0.08
  };

  // Blend mode per finish — subtle visual distinction
  var FINISH_BLEND = {
    'Matte':        'multiply',
    'Gloss':        'multiply',
    'Satin':        'multiply',
    'Chrome':       'screen',
    'Colour Shift': 'overlay',
    'Carbon Fibre': 'multiply',
    'Brushed Metal':'overlay',
    'PPF Clear':    'multiply'
  };

  // Offscreen canvas for processing the raw mask into a proper alpha mask.
  var processedMask = null; // ImageData with proper alpha channel

  // Map of vehicle IDs to their pre-generated mask filenames.
  // Matches the VMAP keys in screen1-upload.js.
  var VEHICLE_MASK_MAP = {
    'land_cruiser_v8':   'assets/masks/land_cruiser_v8.png',
    'range_rover_vogue': 'assets/masks/range_rover_vogue.png',
    'lexus_lx600':       'assets/masks/lexus_lx600.png',
    'prado':             'assets/masks/prado.png',
    'mercedes_gle':      'assets/masks/mercedes_gle.png',
    'bmw_7_series':      'assets/masks/bmw_7_series.png',
    'subaru_outback':    'assets/masks/subaru_outback.png'
  };

  /**
   * Processes a binary mask image into an alpha mask for the overlay.
   * Binary masks (individual or pre-generated) are white-on-black:
   *   white (R+G+B > 600) → vehicle body → opaque
   *   black → background → transparent
   *
   * For combined_mask fallback, SAM-2 paints segments in arbitrary
   * colors and uses pure black for background. We detect any non-black
   * pixel (R+G+B > 10) as a vehicle segment.
   */
  function processRawMask(isBinaryMask) {
    if (!maskImg) return;

    // Draw raw mask to an offscreen canvas at canvas display size
    var offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    var offCtx = offscreen.getContext('2d');
    offCtx.drawImage(maskImg, 0, 0, offscreen.width, offscreen.height);

    // Read pixel data and convert to alpha mask
    var imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
    var pixels = imageData.data;

    for (var i = 0; i < pixels.length; i += 4) {
      var r = pixels[i];
      var g = pixels[i + 1];
      var b = pixels[i + 2];
      var isVehicle;

      if (isBinaryMask) {
        // Binary mask (individual mask or pre-generated): white = vehicle.
        // Use a generous threshold since JPEG compression can soften edges.
        isVehicle = (r + g + b) > 380;
      } else {
        // Combined mask fallback: SAM-2 paints detected segments in
        // arbitrary vivid colors. Background is pure black (0,0,0).
        // Any pixel that is NOT near-black is a detected segment.
        isVehicle = (r + g + b) > 10;
      }

      if (isVehicle) {
        // Vehicle body — make white and fully opaque
        pixels[i]     = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
        pixels[i + 3] = 255;
      } else {
        // Background — make fully transparent
        pixels[i]     = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
      }
    }

    processedMask = imageData;
    console.info('[WV Studio] Mask processed — ' +
      offscreen.width + 'x' + offscreen.height + ' pixels' +
      (isBinaryMask ? ' (binary)' : ' (combined fallback)'));
  }

  /**
   * Draws the color overlay on the canvas using the processed mask.
   * Only vehicle body panels (opaque areas in the mask) get tinted.
   */
  function renderColorOverlay() {
    if (!ctx || !maskReady || !processedMask) return;

    var w = canvas.width;
    var h = canvas.height;

    // Clear previous overlay
    ctx.clearRect(0, 0, w, h);

    // Step 1: Put the processed alpha mask (white vehicle body, transparent bg)
    ctx.putImageData(processedMask, 0, 0);

    // Step 2: Use 'source-in' — color only fills where mask is opaque
    // (= vehicle body panels). Background stays fully transparent.
    ctx.globalCompositeOperation = 'source-in';
    var opacity = FINISH_OPACITY[selFinish] || 0.5;
    ctx.globalAlpha = opacity;
    ctx.fillStyle = selHex;
    ctx.fillRect(0, 0, w, h);

    // Reset composite state
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Apply blend mode via CSS on the canvas element itself
    var blend = FINISH_BLEND[selFinish] || 'multiply';
    canvas.style.mixBlendMode = blend;
  }

  /**
   * Sizes the canvas to match the actual rendered image dimensions.
   * Called on image load and window resize so the overlay stays aligned.
   */
  function sizeCanvas() {
    if (!canvas || !studioPreview) return;
    var rect = studioPreview.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    // Re-process and re-render if mask is ready (processedMask depends
    // on canvas dimensions so it must be regenerated on resize).
    if (maskReady) {
      processRawMask(currentMaskIsBinary);
      renderColorOverlay();
    }
  }

  // Track whether the currently loaded mask is binary or combined
  // so resize reprocessing uses the correct threshold.
  var currentMaskIsBinary = true;

  /**
   * Activates a mask image — sets it as the current mask and renders.
   */
  function activateMask(img, isBinary) {
    maskImg = img;
    maskReady = true;
    currentMaskIsBinary = isBinary;
    if (maskLoading) maskLoading.classList.add('hidden');
    sizeCanvas();
  }

  /**
   * Loads the best available mask. Priority:
   *   1. Pre-generated mask for template vehicles (instant, no API)
   *   2. Individual masks from sessionStorage (pick largest)
   *   3. Combined mask from sessionStorage (fallback)
   */
  function loadMask() {
    // --- Priority 1: Pre-generated mask for template vehicles ---
    var vehicleId = sessionStorage.getItem('wv_vehicle_id');
    if (vehicleId && VEHICLE_MASK_MAP[vehicleId]) {
      var pregenPath = VEHICLE_MASK_MAP[vehicleId];
      console.info('[WV Studio] Loading pre-generated mask for ' + vehicleId);
      if (maskLoading) maskLoading.classList.remove('hidden');

      var pregenImg = new Image();
      pregenImg.onload = function() {
        activateMask(pregenImg, true);
        console.info('[WV Studio] Pre-generated mask loaded — color overlay active');
      };
      pregenImg.onerror = function() {
        console.warn('[WV Studio] Pre-generated mask not found — trying fallbacks');
        loadIndividualOrCombinedMask();
      };
      pregenImg.src = pregenPath;
      return;
    }

    // --- Priority 2 & 3: Individual or combined mask from API ---
    loadIndividualOrCombinedMask();
  }

  /**
   * Loads individual masks from sessionStorage, picks the largest one
   * by white-pixel count. Falls back to the combined mask if individual
   * masks aren't available.
   */
  function loadIndividualOrCombinedMask() {
    var individualJson = sessionStorage.getItem('wv_individual_masks');
    var individualUrls = null;
    try { individualUrls = individualJson ? JSON.parse(individualJson) : null; }
    catch(_e) { individualUrls = null; }

    if (individualUrls && individualUrls.length > 0) {
      console.info('[WV Studio] Loading ' + individualUrls.length + ' individual masks to pick largest');
      if (maskLoading) maskLoading.classList.remove('hidden');
      pickLargestMask(individualUrls);
      return;
    }

    // --- Fallback: combined mask ---
    loadCombinedMask();
  }

  /**
   * Downloads individual mask images, counts white pixels in each,
   * and activates the single largest one as the vehicle body mask.
   */
  function pickLargestMask(urls) {
    var loaded = 0;
    var bestImg = null;
    var bestPixels = 0;
    var totalMasks = urls.length;

    // We need to load each mask image to count white pixels.
    // Since the browser can't getImageData from cross-origin images
    // without CORS, we proxy through the backend.
    urls.forEach(function(url, idx) {
      var img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = function() {
        // Count white pixels using an offscreen canvas
        var offscreen = document.createElement('canvas');
        offscreen.width = img.naturalWidth;
        offscreen.height = img.naturalHeight;
        var offCtx = offscreen.getContext('2d');
        offCtx.drawImage(img, 0, 0);

        var data;
        try {
          data = offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data;
        } catch(e) {
          // CORS taint — try via proxy on this specific mask
          console.warn('[WV Studio] CORS blocked mask ' + (idx+1) + ', trying proxy...');
          tryProxyLoad(url, idx);
          return;
        }

        var whiteCount = 0;
        for (var i = 0; i < data.length; i += 4) {
          if (data[i] + data[i+1] + data[i+2] > 380) whiteCount++;
        }

        console.info('[WV Studio] Mask ' + (idx+1) + '/' + totalMasks + ': ' + whiteCount + ' white px');

        if (whiteCount > bestPixels) {
          bestPixels = whiteCount;
          bestImg = img;
        }

        loaded++;
        if (loaded >= totalMasks) finalizeLargest();
      };

      img.onerror = function() {
        // Direct load failed — try backend proxy
        tryProxyLoad(url, idx);
      };

      img.src = url;
    });

    /** Tries to load a mask via the backend proxy (CORS workaround). */
    function tryProxyLoad(url, idx) {
      var proxyImg = new Image();
      proxyImg.onload = function() {
        var offscreen = document.createElement('canvas');
        offscreen.width = proxyImg.naturalWidth;
        offscreen.height = proxyImg.naturalHeight;
        var offCtx = offscreen.getContext('2d');
        offCtx.drawImage(proxyImg, 0, 0);

        var data;
        try {
          data = offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data;
        } catch(e) {
          console.warn('[WV Studio] Cannot read mask ' + (idx+1) + ' pixels — skipping');
          loaded++;
          if (loaded >= totalMasks) finalizeLargest();
          return;
        }

        var whiteCount = 0;
        for (var i = 0; i < data.length; i += 4) {
          if (data[i] + data[i+1] + data[i+2] > 380) whiteCount++;
        }

        console.info('[WV Studio] Mask ' + (idx+1) + '/' + totalMasks + ' (proxied): ' + whiteCount + ' white px');

        if (whiteCount > bestPixels) {
          bestPixels = whiteCount;
          bestImg = proxyImg;
        }

        loaded++;
        if (loaded >= totalMasks) finalizeLargest();
      };

      proxyImg.onerror = function() {
        console.warn('[WV Studio] Mask ' + (idx+1) + ' proxy also failed — skipping');
        loaded++;
        if (loaded >= totalMasks) finalizeLargest();
      };

      proxyImg.src = '/api/mask-proxy?url=' + encodeURIComponent(url);
    }

    /** Activates the largest mask after all masks have been evaluated. */
    function finalizeLargest() {
      if (bestImg) {
        console.info('[WV Studio] Selected largest mask (' + bestPixels + ' white px)');
        activateMask(bestImg, true);
      } else {
        console.warn('[WV Studio] No individual mask could be loaded — trying combined mask');
        loadCombinedMask();
      }
    }
  }

  /**
   * Loads the combined mask from sessionStorage as a last-resort fallback.
   * Uses improved (r+g+b) > 10 threshold instead of the old broken luminance.
   */
  function loadCombinedMask() {
    var maskUrl = sessionStorage.getItem('wv_segmented_image');
    if (!maskUrl) {
      console.info('[WV Studio] No segmentation mask available — overlay disabled');
      if (maskLoading) maskLoading.classList.add('hidden');
      return;
    }

    console.info('[WV Studio] Loading combined mask (fallback)');
    if (maskLoading) maskLoading.classList.remove('hidden');

    var combinedImg = new Image();
    combinedImg.crossOrigin = 'anonymous';

    combinedImg.onload = function() {
      activateMask(combinedImg, false); // false = combined mask, use (r+g+b)>10
      console.info('[WV Studio] Combined mask loaded — color overlay active (fallback)');
    };

    combinedImg.onerror = function() {
      // Direct load failed (likely CORS) — try backend proxy
      console.warn('[WV Studio] Direct combined mask load failed, trying proxy…');
      var proxyUrl = '/api/mask-proxy?url=' + encodeURIComponent(maskUrl);
      var proxyImg = new Image();

      proxyImg.onload = function() {
        activateMask(proxyImg, false);
        console.info('[WV Studio] Combined mask loaded via proxy — color overlay active (fallback)');
      };

      proxyImg.onerror = function() {
        console.warn('[WV Studio] Combined mask proxy also failed — overlay disabled');
        if (maskLoading) maskLoading.classList.add('hidden');
      };

      proxyImg.src = proxyUrl;
    };

    combinedImg.src = maskUrl;
  }

  // Size canvas when the vehicle image finishes loading
  if (studioPreview) {
    if (studioPreview.complete && studioPreview.naturalWidth > 0) {
      sizeCanvas();
    }
    studioPreview.addEventListener('load', sizeCanvas);
  }

  // Re-size canvas on viewport changes (responsive)
  window.addEventListener('resize', sizeCanvas);

  // Start loading the mask
  loadMask();

  // -----------------------------------------------------------------------
  // Menu toggle
  // -----------------------------------------------------------------------

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  // -----------------------------------------------------------------------
  // Finish buttons — update finish selection + re-render overlay
  // -----------------------------------------------------------------------

  var finishBtns=document.querySelectorAll('.finish-btn');
  finishBtns.forEach(function(btn){
    btn.addEventListener('click',function(){
      finishBtns.forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      selFinish=btn.getAttribute('data-finish');
      document.getElementById('wv-finish-badge').textContent=selFinish;
      document.getElementById('wv-sum-finish').textContent=selFinish;
      if(studioPreview){ studioPreview.setAttribute('data-finish',selFinish); }
      // Re-render overlay with new finish opacity/blend
      renderColorOverlay();
    });
  });

  // -----------------------------------------------------------------------
  // Color swatches — update color selection + re-render overlay
  // -----------------------------------------------------------------------

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
      // Re-render overlay with new color
      renderColorOverlay();
    });
  });

  // -----------------------------------------------------------------------
  // Advance to review/send screen — no pricing is computed or requested.
  // -----------------------------------------------------------------------

  document.getElementById('wv-get-quote').addEventListener('click',function(){
    sessionStorage.setItem('wv_finish',selFinish);
    sessionStorage.setItem('wv_color',selColor);
    sessionStorage.setItem('wv_color_hex',selHex);
    sessionStorage.setItem('wv_vision',document.getElementById('wv-vision').value||'');
    window.location.href='screen3-quote.html';
  });
})();
