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
  var FRAME_PATH = 'bg-frames/ezgif-frame-'
  var MIN_LOADER_MS = 2500
  var BATCH_SIZE = 12

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

  /** Draw a frame at the given index using "cover" logic. */
  function drawFrame(idx) {
    var img = frames[idx]
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

  function preloadFrames() {
    var t0 = Date.now()
    var loaded = 0
    var targetPercent = 0
    var currentPercent = 0
    var loaderRaf

    function updateLoader() {
      // Eases out: fast at start, slows down as it approaches target
      currentPercent += (targetPercent - currentPercent) * 0.08
      if (currentPercent > 99.9) currentPercent = 100
      
      var displayPct = Math.round(currentPercent)
      loaderFill.style.width = currentPercent + '%'
      loaderPercent.textContent = displayPct + '%'

      if (currentPercent < 100) {
        loaderRaf = requestAnimationFrame(updateLoader)
      }
    }
    loaderRaf = requestAnimationFrame(updateLoader)

    function loadOne(i) {
      var pad = String(i + 1).padStart(3, '0')
      return fetch(FRAME_PATH + pad + '.jpg')
        .then(function (resp) { return resp.blob() })
        .then(function (blob) { return createImageBitmap(blob) })
        .then(function (bmp) {
          frames[i] = bmp
          loaded++
          targetPercent = (loaded / TOTAL_FRAMES) * 100
        })
    }

    function loadBatch(startIdx) {
      if (startIdx >= TOTAL_FRAMES) {
        // All loaded — enforce minimum display time
        var elapsed = Date.now() - t0
        var remaining = Math.max(0, MIN_LOADER_MS - elapsed)
        return new Promise(function (resolve) {
          setTimeout(resolve, remaining)
        }).then(onAllLoaded)
      }

      var batch = []
      var end = Math.min(startIdx + BATCH_SIZE, TOTAL_FRAMES)
      for (var j = startIdx; j < end; j++) {
        batch.push(loadOne(j))
      }
      return Promise.all(batch).then(function () {
        return loadBatch(startIdx + BATCH_SIZE)
      })
    }

    loadBatch(0)
  }

  function onAllLoaded() {
    // draw first frame
    drawFrame(0)
    currentFrame = 0

    // Initialize all GSAP and UI components immediately so they are prepped 
    // before the loader fades out, avoiding any Flash of Unstyled Content (FOUC).
    initLenis()
    initScrollAnimations()
    initCursorBubble()
    initNavDots()

    // dismiss loader
    loader.classList.add('dismissed')
    document.body.classList.add('loaded')
    isLoaded = true

    // wait for loader fade-out, then remove it from DOM
    setTimeout(function () {
      loader.remove()
    }, 850)
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
      duration: 2.0,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)) },
      smoothWheel: true,
      wheelMultiplier: 0.8,
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
    // 0.85s (loader fade) + 0.1s (user requested delay) = 0.95s
    var heroTl = gsap.timeline({ delay: 0.95 })
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
  //  CURSOR BUBBLE
  // =============================================

  function initCursorBubble() {
    // skip on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return

    var mx = -100, my = -100
    var bx = -100, by = -100

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX
      my = e.clientY
    })

    // smooth follow via rAF
    function tick() {
      bx += (mx - bx) * 0.13
      by += (my - by) * 0.13
      bubble.style.left = bx + 'px'
      bubble.style.top = by + 'px'
      requestAnimationFrame(tick)
    }
    tick()

    // attach to [data-tooltip] elements
    var els = document.querySelectorAll('[data-tooltip]')
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        el.addEventListener('mouseenter', function () {
          bubbleText.textContent = el.getAttribute('data-tooltip')
          bubble.classList.add('active')
        })
        el.addEventListener('mouseleave', function () {
          bubble.classList.remove('active')
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

  setupCanvas()
  preloadFrames()
})()
