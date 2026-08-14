# Portfolio Website — Build Brief for Claude Code

**Read this whole brief before writing any code. Then follow the "Design Process" section
at the bottom — do that thinking first, in your own reasoning, before touching the
codebase.**

## 1. What this project is

A single-page, scroll-driven cinematic portfolio site. The entire background of the
page is one continuous pre-rendered frame sequence (already generated, sitting in a
folder in this repo — locate it and confirm the frame count/naming pattern before
building anything). As the user scrolls from top to bottom of the page, the frame
sequence advances in lockstep with scroll position — frame 1 at the top, the last
frame at the bottom, every frame in between mapped proportionally. This is **not** a
looping video and **not** a per-section animation — one continuous sequence spans the
entire page, underneath every section.

Sections, in order: **Hero → Education → Skills → Experience → Contact**.

## 2. Non-negotiable technical requirements

### Background frame engine
- Render frames on `<canvas>`, not `<video>` or `<img>` — canvas gives frame-accurate
  scroll scrubbing that a video element's `currentTime` seeking cannot reliably match,
  especially on WebP/frame-sequence sources.
- **Sharpness is critical — do not let this blur.** Set the canvas backing resolution
  to `window.innerWidth * devicePixelRatio` × `window.innerHeight * devicePixelRatio`,
  scale the drawing context accordingly, and set
  `ctx.imageSmoothingQuality = 'high'`. Verify on a retina/high-DPI display that frames
  are pixel-sharp, not soft.
- Preload frames before reveal (see loader below). Use `createImageBitmap()` for
  decoded-frame storage rather than raw `Image` objects — it's faster to draw and
  avoids decode jank on scroll.
- Map scroll progress (0–1 across the full page height) to frame index
  (`Math.round(progress * (totalFrames - 1))`), and only redraw the canvas when the
  computed frame index actually changes — don't redraw every scroll event.
- Canvas stays `position: fixed`, full-viewport, `z-index` below all section content.
  Sections scroll normally on top of it with transparent/semi-transparent backgrounds
  so the frame sequence stays visible throughout.

### Scroll smoothing
- Use **GSAP with ScrollTrigger** as the animation backbone for section reveals,
  text/element transitions, and pinning.
- For inertia/smooth-scroll: default to **Lenis** (`studio-freight/lenis`) paired with
  ScrollTrigger's `scrollerProxy` — it's the current standard pairing for GSAP,
  actively maintained, and lighter than Locomotive Scroll. Locomotive Scroll (v4) is
  the alternative the client mentioned and is a legitimate option, but is less
  actively maintained and has had rougher GSAP interop historically.
  **Use your judgment**: if you hit friction wiring Lenis to the canvas frame-scrub
  logic, Locomotive is an acceptable fallback — but justify the choice either way in
  a short comment at the top of the scroll-setup file.
- Whatever you choose, the frame-scrub calculation must read from the *smoothed*
  scroll value (not raw native scroll), so the background and the smoothed section
  motion never visually decouple from each other.

### Loader
- All frames must finish preloading before the site is interactive.
- Loader animation should be **slow and deliberate** — not a fast spinner. Think: a
  slow progress fill or a slow fade/reveal tied to actual load percentage, minimum
  ~2–3 seconds even if frames load faster, so it never feels like a flash.
- No layout shift or flash of unstyled content when the loader dismisses.

### Performance / quality bar
- 60fps scroll on a mid-range laptop is the target. If frame count/resolution makes
  that impossible, downsample the *display* size of the canvas draw (not the source
  quality) or use `requestAnimationFrame`-batched draws rather than dropping frame
  sharpness.
- Respect `prefers-reduced-motion`: if set, skip Lenis smoothing (use native scroll)
  and consider capping frame-scrub rate — don't disable the background entirely, but
  don't force heavy motion on users who've opted out.
- Fully responsive down to mobile. On mobile, decide whether the full frame sequence
  is performant enough to keep, or whether a lighter treatment (fewer frames sampled,
  smaller canvas) is warranted — your call, document the reasoning.

## 3. Sections (content structure, not visual spec)

1. **Hero** — name, role, one-line positioning, scroll cue.
2. **Education** — school/program entries with dates and short context.
3. **Skills** — technical skills, grouped or laid out however best fits the visual
   language you land on.
4. **Experience** — projects/work entries with dates, description, links.
5. **Contact** — contact form or contact details + social/portfolio links.

(Pull actual content from the client — do not invent credentials, project names, or
dates. If content isn't provided, use clearly-labeled placeholder text and flag it.)

## 4. Design autonomy — and how to use it well

**Do not look up, reference, or pattern-match against any existing portfolio site —
including the client's own — as a template for this build.** Work from first
principles: the frame footage in the folder, the content given to you, and your own
design and engineering judgment. This applies to the frame-scrub engine and smoothing
setup in section 2 as much as it does to visual design — reason through the
scroll-to-frame-index math and the Lenis/GSAP wiring yourself rather than copying a
pattern from somewhere else.

You have full authority to choose typography, color system, layout, and micro-motion
for every section. Use it deliberately, not by default. Concretely:

- **Ground every choice in the background frames themselves.** Open the frame folder,
  look at actual frames (start, middle, end) before deciding anything — palette, mood,
  and pacing should visually belong to the same world as that footage, not sit on top
  of it as an unrelated UI skin.
- Avoid the generic AI-portfolio defaults: warm cream + terracotta serif, near-black +
  single acid accent, or broadsheet-hairline-columns — unless the frames themselves
  genuinely call for one of these, which is unlikely given a dark cold-toned tech
  background.
- Pick a real type pairing (display + body, plus a mono/utility face if the tech
  aesthetic calls for it) — not a default system-font stack.
- Decide deliberately whether numbered section markers, index rails, or "FIG."-style
  labels make sense for *this* content, rather than including them as decoration.
- Spend your one boldest design move in a single signature moment (could be the
  loader, could be a hero interaction, could be how a section pins against the
  background) — keep the rest disciplined and quiet around it.
- Self-critique before final delivery: take screenshots at desktop and mobile widths,
  check keyboard focus states, check that motion respects reduced-motion, and remove
  one thing if the page feels over-decorated.

## 5. Build order (suggested)

1. Scaffold project (confirm framework already in repo, or set up Next.js + Tailwind
   if greenfield).
2. Locate and inventory the frames folder — confirm count, naming pattern, resolution,
   format.
3. Build the canvas frame-engine in isolation first (scroll → frame index → draw),
   verify sharpness and scroll-sync before adding any section content on top.
4. Wire up Lenis/GSAP ScrollTrigger smoothing, re-verify frame sync still holds.
5. Build the loader against the real preload sequence.
6. Build sections in order (Hero → Education → Skills → Experience → Contact),
   applying the design system decided in step 0 (see Design Process below).
7. Responsive pass, reduced-motion pass, performance pass.
8. Screenshot self-critique, then polish.

## 6. Design process (do this first, in reasoning, before writing UI code)

Before building any section UI:
1. **Brainstorm**: write a compact design token plan — 4–6 named hex colors, 2–3
   typefaces with roles, a one-paragraph layout concept per section, and the single
   "signature" element the page will be remembered by.
2. **Critique it yourself**: would this design plan be the same for any generic dark
   tech portfolio, or is it specific to *this* frame sequence and *this* content? Revise
   anything that reads as default.
3. Only then start writing section code, following the revised plan.
