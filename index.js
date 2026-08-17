/* ============================================
   Araish Ahmad — Cinematic Portfolio
   Scroll engine: Lenis + GSAP ScrollTrigger

   Lenis chosen over Locomotive Scroll for this build:
   - Lighter footprint, actively maintained (v1.1.x)
   - Native ScrollTrigger integration via the
     lenis.on('scroll', ScrollTrigger.update) pattern
   - Smoother interop with canvas frame-scrub logic
   ============================================ */

;(function () {
  'use strict'

  // ——— Config ———
  var TOTAL_FRAMES = 300
  var CRITICAL_FRAMES = 30   // frames loaded before site is revealed (~1.1 MB)
  var FRAME_PATH = 'bg-frames/ezgif-frame-'
  var BATCH_SIZE = 30        // larger batches leverage HTTP/2 parallelism

  // ——— State ———
  var frames = new Array(TOTAL_FRAMES)
  var currentFrame = -1
  var isLoaded = false
  var lenis = null

  // ——— DOM refs ———
  var canvas = document.getElementById('bg-canvas')
  var ctx = canvas.getContext('2d', { alpha: false })
  var loader = document.getElementById('loader')
  var loaderFill = document.getElementById('loader-fill')
  var loaderPercent = document.getElementById('loader-percent')
  var bubble = document.getElementById('cursor-bubble')
  var bubbleText = document.getElementById('cursor-bubble-text')

  // =============================================
  //  CANVAS — retina-sharp, cover-fit drawing
  // =============================================

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
  }

  /**
   * Draw a frame using "cover" logic.
   * If the requested frame isn't loaded yet (background phase still running),
   * walk backward to find the nearest available frame so canvas never goes blank.
   */
  function drawFrame(idx) {
    var img = frames[idx]
    // nearest-frame fallback — walk back up to 30 slots
    if (!img) {
      for (var f = idx - 1; f >= Math.max(0, idx - 30); f--) {
        if (frames[f]) { img = frames[f]; break }
      }
    }
    if (!img) return

    var cw = canvas.width
    var ch = canvas.height
    var iw = img.width
    var ih = img.height

    // cover-fit crop
    var canvasRatio = cw / ch
    var imgRatio = iw / ih
    var sx, sy, sw, sh

    if (imgRatio > canvasRatio) {
      sh = ih
      sw = sh * canvasRatio
      sx = (iw - sw) / 2
      sy = 0
    } else {
      sw = iw
      sh = sw / canvasRatio
      sx = 0
      sy = (ih - sh) / 2
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch)
  }

  // =============================================
  //  FRAME PRELOADER
  // =============================================

  // =============================================
  //  FRAME PRELOADER — Two-phase progressive strategy
  //
  //  Phase 1 (Critical): Load first CRITICAL_FRAMES frames (~1.1 MB).
  //                      Site is revealed immediately after these are ready.
  //  Phase 2 (Background): Remaining frames load silently while user browses.
  //                      drawFrame() uses a nearest-frame fallback so the
  //                      canvas never goes blank during background loading.
  // =============================================

  function preloadFrames() {
    var loaded = 0          // tracks phase-1 progress for the loader UI
    var targetPercent = 0
    var currentPercent = 0

    // Animated loader bar (eases toward targetPercent each rAF tick)
    function updateLoader() {
      currentPercent += (targetPercent - currentPercent) * 0.1
      if (currentPercent > 99.9) currentPercent = 100
      var displayPct = Math.round(currentPercent)
      loaderFill.style.width = currentPercent + '%'
      loaderPercent.textContent = displayPct + '%'
      if (currentPercent < 100) requestAnimationFrame(updateLoader)
    }
    requestAnimationFrame(updateLoader)

    // Load a single frame by index, returns a Promise
    function loadOne(i) {
      var pad = String(i + 1).padStart(3, '0')
      return fetch(FRAME_PATH + pad + '.jpg')
        .then(function (resp) { return resp.blob() })
        .then(function (blob) { return createImageBitmap(blob) })
        .then(function (bmp) { frames[i] = bmp })
        .catch(function () { /* silently skip any failed frame */ })
    }

    // Load a batch of frames in parallel, returns a Promise
    function loadBatch(startIdx, count) {
      var batch = []
      var end = Math.min(startIdx + count, TOTAL_FRAMES)
      for (var j = startIdx; j < end; j++) batch.push(loadOne(j))
      return Promise.all(batch)
    }

    // ——— PHASE 1: Load critical frames, update loader bar ———
    // We load CRITICAL_FRAMES one-by-one so the bar increments smoothly.
    var phase1Promises = []
    for (var i = 0; i < CRITICAL_FRAMES; i++) {
      ;(function (idx) {
        var p = loadOne(idx).then(function () {
          loaded++
          // Scale phase-1 progress to fill 0–100% of the loader bar
          targetPercent = (loaded / CRITICAL_FRAMES) * 100
        })
        phase1Promises.push(p)
      })(i)
    }

    Promise.all(phase1Promises).then(function () {
      // Phase 1 complete — reveal the site immediately
      onCriticalLoaded()

      // ——— PHASE 2: Background load remaining frames in large batches ———
      function loadNextBatch(startIdx) {
        if (startIdx >= TOTAL_FRAMES) return   // all done
        loadBatch(startIdx, BATCH_SIZE).then(function () {
          loadNextBatch(startIdx + BATCH_SIZE)
        })
      }
      loadNextBatch(CRITICAL_FRAMES)
    })
  }

  // Called once phase-1 (critical frames) are ready — shows the site
  function onCriticalLoaded() {
    // Draw first frame before revealing to avoid flash of empty canvas
    drawFrame(0)
    currentFrame = 0

    // Initialize all GSAP and UI components immediately so they are prepped
    // before the loader fades out, avoiding any Flash of Unstyled Content (FOUC).
    // NOTE: initCursorBubble() is intentionally NOT called here — it boots
    // eagerly on DOMContentLoaded so it works even before frames finish loading.
    initLenis()
    initScrollAnimations()
    initNavDots()

    // Dismiss loader
    loader.classList.add('dismissed')
    document.body.classList.add('loaded')
    isLoaded = true

    // Remove loader from DOM after fade-out completes
    setTimeout(function () {
      if (loader && loader.parentNode) loader.remove()
    }, 600)
  }

  // =============================================
  //  LENIS SMOOTH SCROLL
  // =============================================

  function getScrollProgress() {
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight
    if (maxScroll <= 0) return 0
    var scroll = lenis ? lenis.scroll : window.scrollY
    return Math.max(0, Math.min(1, scroll / maxScroll))
  }

  function updateCanvasFrame() {
    var p = getScrollProgress()
    var idx = Math.round(p * (TOTAL_FRAMES - 1))
    if (idx !== currentFrame) {
      currentFrame = idx
      drawFrame(idx)
    }
  }

  function initLenis() {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    gsap.registerPlugin(ScrollTrigger)

    if (prefersReduced) {
      // fallback: native scroll, still scrub canvas
      window.addEventListener('scroll', updateCanvasFrame, { passive: true })
      return
    }

    lenis = new Lenis({
      duration: 1.4,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)) },
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 2
    })

    // connect Lenis ↔ ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update)

    // canvas frame scrub reads smoothed scroll
    lenis.on('scroll', updateCanvasFrame)

    // drive Lenis via GSAP ticker
    gsap.ticker.add(function (time) { lenis.raf(time * 1000) })
    gsap.ticker.lagSmoothing(0)
  }

  // =============================================
  //  GSAP SCROLL ANIMATIONS
  // =============================================

  function initScrollAnimations() {
    // ——— Hero entrance (on load, not scroll) ———
    // 0.5s (loader fade) + 0.1s buffer = 0.6s total delay
    var heroTl = gsap.timeline({ delay: 0.6 })
    heroTl
      .from('.hero-greeting', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' })
      .from('.hero-name', { y: 50, opacity: 0, duration: 1, ease: 'power3.out' }, '-=0.45')
      .from('.hero-role', { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out' }, '-=0.55')
      .from('.hero-tagline', { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=0.45')
      .from('.scroll-cue', { y: 15, opacity: 0, duration: 0.6, ease: 'power3.out' }, '-=0.3')

    // ——— Section labels ———
    var labels = document.querySelectorAll('.section-label')
    for (var i = 0; i < labels.length; i++) {
      gsap.from(labels[i], {
        scrollTrigger: { trigger: labels[i], start: 'top 88%', end: 'top 65%', scrub: 1 },
        x: -50,
        opacity: 0
      })
    }

    // ——— Generic .animate-in elements ———
    var animateEls = document.querySelectorAll('.animate-in')
    for (var j = 0; j < animateEls.length; j++) {
      gsap.from(animateEls[j], {
        scrollTrigger: { trigger: animateEls[j], start: 'top 88%', end: 'top 68%', scrub: 1 },
        y: 45,
        opacity: 0
      })
    }

    // Nested skill tags stagger removed to prevent mobile GSAP opacity bugs.
    // The parent .skill-group (.animate-in) will fade them all in together.

    // ——— NETSOL featured card ———
    var featured = document.querySelector('.exp-card--featured')
    if (featured) {
      gsap.from(featured, {
        scrollTrigger: { trigger: featured, start: 'top 88%' },
        y: 60,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out'
      })
    }

    // ——— Project cards stagger ———
    var projCards = document.querySelectorAll('.project-card')
    if (projCards.length) {
      gsap.from(projCards, {
        scrollTrigger: { trigger: projCards[0], start: 'top 85%' },
        y: 45,
        opacity: 0,
        stagger: 0.12,
        duration: 0.7,
        ease: 'power3.out'
      })
    }

    // ——— Contact section ———
    var contactInner = document.querySelector('.contact-content')
    if (contactInner) {
      gsap.from(contactInner.children, {
        scrollTrigger: { trigger: contactInner, start: 'top 85%' },
        y: 35,
        opacity: 0,
        stagger: 0.1,
        duration: 0.7,
        ease: 'power3.out'
      })
    }
  }

  // =============================================
  //  CURSOR BUBBLE — boots immediately on DOM ready
  // =============================================

  // SVG icon helper — wraps path data in a consistent 24×24 stroked SVG
  function svg(d) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'
  }

  // Reusable icon SVGs
  var I = {
    user:       svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    star:       svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    arrowDown:  svg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
    graduation: svg('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/>'),
    award:      svg('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>'),
    code:       svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
    database:   svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>'),
    book:       svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>'),
    coffee:     svg('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>'),
    palette:    svg('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
    bolt:       svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
    cpu:        svg('<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>'),
    chat:       svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    rocket:     svg('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 3 0 3 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-3 0-3"/>'),
    atom:       svg('<circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z"/>'),
    server:     svg('<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>'),
    gitBranch:  svg('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
    github:     svg('<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>'),
    box:        svg('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>'),
    triangle:   svg('<path d="m12 2 10 18H2z"/>'),
    building:   svg('<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>'),
    mic:        svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>'),
    wallet:     svg('<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>'),
    mapPin:     svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
    extLink:    svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>'),
    mail:       svg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
    phone:      svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    linkedin:   svg('<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>'),
    barChart:   svg('<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>'),
    tree:       svg('<path d="M12 22v-7"/><path d="M12 2 7 9h10z"/><path d="M12 8 5 17h14z"/>'),
  }

  // Context map: tooltip text → { icon (SVG string), hint }
  var BUBBLE_CONTEXT = {
    // Hero
    "That's me!":        { icon: I.user,       hint: 'Araish Ahmad' },
    'Araish Ahmad':      { icon: I.star,       hint: 'AI/ML Engineer' },
    'Scroll Down':       { icon: I.arrowDown,  hint: 'Explore' },
    'Home':              { icon: I.user,       hint: 'Back to top' },
    // Education
    'COMSATS University':{ icon: I.graduation, hint: 'BS Computer Science' },
    'Certifications':    { icon: I.award,      hint: 'Verified badges' },
    'HackerRank':        { icon: I.code,       hint: 'Problem Solving' },
    'Great Learning':    { icon: I.barChart,   hint: 'SQL & Data' },
    'University of Michigan': { icon: I.book,  hint: 'Python — Coursera' },
    // Skills
    'Python':            { icon: I.code,       hint: 'Primary language' },
    'SQL':               { icon: I.database,   hint: 'Data queries' },
    'Java':              { icon: I.coffee,     hint: 'OOP & DSA' },
    'HTML & CSS':        { icon: I.palette,    hint: 'Web fundamentals' },
    'JavaScript':        { icon: I.bolt,       hint: 'Dynamic UIs' },
    'Machine Learning':  { icon: I.cpu,        hint: 'Core specialty' },
    'Random Forest':     { icon: I.tree,       hint: 'Ensemble model' },
    'NLP':               { icon: I.chat,       hint: 'Text & speech' },
    'FastAPI':           { icon: I.rocket,     hint: 'Python backend' },
    'React':             { icon: I.atom,       hint: 'Component UIs' },
    'Node.js':           { icon: I.server,     hint: 'Server-side JS' },
    'Git':               { icon: I.gitBranch,  hint: 'Version control' },
    'GitHub':            { icon: I.github,     hint: 'Code hosting' },
    'Docker':            { icon: I.box,        hint: 'Containers' },
    'Docker Hub':        { icon: I.box,        hint: 'Image registry' },
    'Vercel':            { icon: I.triangle,   hint: 'Deployments' },
    // Experience
    'Netsol Technologies':{ icon: I.building,  hint: 'AI/ML Intern' },
    'Elytra Studios':    { icon: I.atom,       hint: 'React Dev Intern' },
    // Projects
    'Speech Emotion Recognition': { icon: I.mic, hint: 'ML · Python' },
    'SplitWise':         { icon: I.wallet,     hint: 'Full-stack app' },
    'NYC Taxi Warehouse':{ icon: I.mapPin,     hint: 'Big Data pipeline' },
    'GitHub Repository': { icon: I.extLink,    hint: 'View on GitHub' },
    // Contact
    'Email':             { icon: I.mail,       hint: 'Get in touch' },
    'LinkedIn':          { icon: I.linkedin,   hint: 'Connect with me' },
    // Nav dots
    'Education':         { icon: I.graduation, hint: 'Academic history' },
    'Skills':            { icon: I.code,       hint: 'Tech stack' },
    'Experience':        { icon: I.building,   hint: 'Work history' },
    'Projects':          { icon: I.box,        hint: 'What I built' },
    'Contact':           { icon: I.mail,       hint: 'Reach out' },
  }

  function initCursorBubble() {
    // Only show on devices with a precise pointer (mouse / trackpad).
    // Do NOT use maxTouchPoints — it's > 0 on touchscreen laptops.
    if (!window.matchMedia('(pointer: fine)').matches) return
    // guard against double-init
    if (window.__cursorBubbleInit) return
    window.__cursorBubbleInit = true

    var dot = document.getElementById('cursor-dot')
    var bubbleIcon = document.getElementById('cursor-bubble-icon')
    var bubbleHint = document.getElementById('cursor-bubble-hint')

    // Start both well off-screen so they don't flash at (0,0)
    var mx = -200, my = -200
    var bx = -200, by = -200

    var dotVisible = false

    // Force offscreen via inline style immediately (overrides any CSS cascade)
    dot.style.left = '-200px'
    dot.style.top = '-200px'
    dot.style.opacity = '0'

    // Dot snaps to raw cursor instantly; fades in on very first move
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX
      my = e.clientY
      dot.style.left = mx + 'px'
      dot.style.top = my + 'px'
      if (!dotVisible) {
        dotVisible = true
        dot.style.opacity = '1'
      }
    }, { passive: true })

    document.addEventListener('mouseleave', function () { dot.style.opacity = '0' })
    document.addEventListener('mouseenter', function () { if (dotVisible) dot.style.opacity = '1' })

    // Bubble smooth-follows with lerp lag
    function tick() {
      bx += (mx - bx) * 0.1
      by += (my - by) * 0.1
      bubble.style.left = bx + 'px'
      bubble.style.top = by + 'px'
      requestAnimationFrame(tick)
    }
    tick()

    // Attach to [data-tooltip] elements
    var els = document.querySelectorAll('[data-tooltip]')
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        el.addEventListener('mouseenter', function () {
          var tip = el.getAttribute('data-tooltip')
          var ctx = BUBBLE_CONTEXT[tip] || {}

          bubbleText.textContent = tip

          if (ctx.icon) {
            bubbleIcon.innerHTML = ctx.icon
            bubble.classList.add('has-icon')
          } else {
            bubbleIcon.innerHTML = ''
            bubble.classList.remove('has-icon')
          }

          if (ctx.hint) {
            bubbleHint.textContent = ctx.hint
            bubble.classList.add('has-hint')
          } else {
            bubbleHint.textContent = ''
            bubble.classList.remove('has-hint')
          }

          bubble.classList.add('active')
        })

        el.addEventListener('mouseleave', function () {
          bubble.classList.remove('active')
          bubble.classList.remove('has-icon')
          bubble.classList.remove('has-hint')
        })
      })(els[i])
    }
  }

  // =============================================
  //  NAV DOTS — highlight active section
  // =============================================

  function initNavDots() {
    var dots = document.querySelectorAll('.nav-dot')
    var sections = document.querySelectorAll('.section')

    // click to scroll
    for (var i = 0; i < dots.length; i++) {
      (function (dot) {
        dot.addEventListener('click', function (e) {
          e.preventDefault()
          var target = document.querySelector(dot.getAttribute('href'))
          if (target) {
            if (lenis) {
              lenis.scrollTo(target, { duration: 1.6 })
            } else {
              target.scrollIntoView({ behavior: 'smooth' })
            }
          }
        })
      })(dots[i])
    }

    // highlight on scroll
    for (var j = 0; j < sections.length; j++) {
      (function (sec, idx) {
        ScrollTrigger.create({
          trigger: sec,
          start: 'top center',
          end: 'bottom center',
          onEnter: function () { setActiveDot(idx) },
          onEnterBack: function () { setActiveDot(idx) }
        })
      })(sections[j], j)
    }

    function setActiveDot(idx) {
      for (var d = 0; d < dots.length; d++) {
        if (d === idx) {
          dots[d].classList.add('active')
        } else {
          dots[d].classList.remove('active')
        }
      }
    }
  }

  // =============================================
  //  RESIZE
  // =============================================

  var resizeTimer
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(function () {
      setupCanvas()
      if (currentFrame >= 0) drawFrame(currentFrame)
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh()
    }, 150)
  })

  // =============================================
  //  BOOT
  // =============================================

  // Cursor bubble runs immediately — no frame loading needed
  document.addEventListener('DOMContentLoaded', function () {
    initCursorBubble()
  })
  // (fallback: if script runs after DOMContentLoaded already fired)
  if (document.readyState !== 'loading') {
    initCursorBubble()
  }

  setupCanvas()
  preloadFrames()
})()
