# Araish Ahmad — Portfolio Website

A cinematic, scroll-driven personal portfolio website for **Araish Ahmad** — Computer Science student at COMSATS University, specializing in AI/ML engineering and full-stack development.

---

## ✨ Features

- 🎬 **Cinematic Loader** — animated progress bar with smooth easing before site reveal
- 🖼️ **Canvas Frame Scrubbing** — 300 background frames tied to scroll position for a video-like parallax effect
- 🌀 **Smooth Scrolling** — powered by [Lenis](https://github.com/darkroomengineering/lenis) (v1.1.x)
- 🎞️ **GSAP Animations** — scroll-triggered entrance animations via [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- 🖱️ **Custom Cursor Bubble** — follows mouse and shows tooltips on interactive elements
- 🔵 **Nav Dots** — fixed side navigation that highlights the active section
- 📱 **Responsive Design** — works on desktop and mobile
- ♿ **Accessible** — semantic HTML, `aria-*` labels, reduced-motion support

---

## 🗂️ Project Structure

```
portfolio-araish/
├── index.html              # Main HTML — all sections and markup
├── index.css               # All styles (dark theme, animations, layout)
├── index.js                # Site logic (loader, canvas, GSAP, Lenis, cursor)
├── bg-frames/              # 300 JPEG frames for background scroll animation
│   └── ezgif-frame-001.jpg … ezgif-frame-300.jpg
├── image.png               # Profile photo (hero avatar)
├── favicon.svg             # SVG favicon
└── Araish_Ahmad_Resume.pdf # Downloadable resume
```

---

## 🚀 Running Locally

Since this is a **static site**, you need a local HTTP server (not just opening `index.html` directly) because the background frames are loaded via `fetch()`, which is blocked by browsers over `file:///` due to CORS.

### Option 1 — Using `npx serve` (recommended)

```powershell
npx -y serve . -p 3000
```

Then open your browser at: **http://localhost:3000**

### Option 2 — Using VS Code Live Server

Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, right-click `index.html`, and select **"Open with Live Server"**.

### Option 3 — Using Python

```bash
# Python 3
python -m http.server 3000
```

---

## 🛠️ Tech Stack

| Layer         | Technology                                       |
|---------------|--------------------------------------------------|
| Structure     | HTML5 (semantic)                                 |
| Styling       | Vanilla CSS (custom properties, flexbox)         |
| Logic         | Vanilla JavaScript (ES5-compatible IIFE)         |
| Animations    | GSAP 3 + ScrollTrigger (CDN)                     |
| Smooth Scroll | Lenis v1.1.13 (CDN)                              |
| Fonts         | Google Fonts — Outfit, DM Sans, JetBrains Mono  |

> No build tools, no npm packages, no bundlers — just open and run.

---

## 📄 Sections

| #  | Section    | Description                                                    |
|----|------------|----------------------------------------------------------------|
| —  | Hero       | Name, role, tagline, profile photo                             |
| 01 | Education  | COMSATS University + certifications                            |
| 02 | Skills     | Languages, AI/ML, Frameworks, Tools & Platforms                |
| 03 | Experience | NETSOL Technologies (AI/ML Intern), Elytra Studios             |
| 04 | Projects   | Speech Emotion Recognition, SplitWise, NYC Taxi Warehouse      |
| 05 | Contact    | Email, phone, GitHub, LinkedIn links                           |

---

## 🎞️ Background Animation

The `bg-frames/` folder contains **300 JPEG frames** extracted from a video/GIF. These are preloaded in batches of 12 on startup and drawn to a `<canvas>` element. As you scroll, the frame index is mapped to scroll progress — creating a smooth cinematic background effect.

> ⚠️ If `bg-frames/` is missing or frames fail to load, the loader will stall at 0%. Always serve via HTTP, not `file:///`.

---

## 📬 Contact

- **Email:** araish.ahmadd@gmail.com
- **Phone:** +92-333-7661444
- **GitHub:** [github.com/araishahmad](https://github.com/araishahmad)
- **LinkedIn:** [linkedin.com/in/araish-ahmad](https://www.linkedin.com/in/araish-ahmad/)
