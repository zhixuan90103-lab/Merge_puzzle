---
title: Research Notes
date: 2026-08-11 16:21
query: "mobile portrait letterbox touch mapping fixed design resolution game canvas pointer events none HUD"
type: tech
sources: 5
model: grok-4-1-fast
generated_by: grok-search
---
# HTML5 Canvas Scaling, iOS PWA Game Development, and Game UI/UX Best Practices

## Table of Contents
- [Source 1: Automatic Letterbox Scaling HTML5 Canvas (Stack Overflow)](https://stackoverflow.com/questions/72148189/automatic-letterbox-scaling-html5-canvas)
- [Source 2: iOS Game UI for Web & PWA: A Developer Guide](https://gist.github.com/fozzedout/5e77925381991a9570151550992baf14)
- [Source 3: Game UI/UX Skill](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/game-ui-ux/SKILL.md)
- [Source 4: Game UI Patterns](https://github.com/chrislaupama/threejs-game-studio/blob/main/references/ui.md)
- [Source 5: Corona Invader Game HTML](https://github.com/Zyzto/Corona_Invader/blob/master/game.html)
- [Summary](#summary)
- [All Cited URLs](#all-cited-urls)

## Source 1: Automatic Letterbox Scaling HTML5 Canvas (Stack Overflow)
**URL:** https://stackoverflow.com/questions/72148189/automatic-letterbox-scaling-html5-canvas

**Main topic and thesis:**  
Automatic letterbox scaling for HTML5 Canvas elements to maintain aspect ratio across different screen sizes.

**Key points and arguments:**  
- Discussion on handling canvas resizing while preserving the game's intended aspect ratio.  
- Techniques for letterboxing (adding black bars) instead of stretching or cropping.  
- JavaScript-based solutions for dynamic viewport adjustments.

**Important data, statistics, quotes:**  
- Focuses on responsive canvas handling without specific numerical data in available retrieval.

**Conclusions:**  
Proper scaling prevents distortion and ensures consistent gameplay experience; implement via resize listeners and aspect-ratio calculations.

## Source 2: iOS Game UI for Web & PWA: A Developer Guide
**URL:** https://gist.github.com/fozzedout/5e77925381991a9570151550992baf14

**Main topic and thesis:**  
Comprehensive guide to building fullscreen web games and PWAs on iPhone, addressing safe area insets, Dynamic Island, canvas sizing, and iOS-specific WebKit bugs.

**Key points and arguments:**  
- Critical use of `viewport-fit=cover` meta tag; without it, safe-area insets resolve to 0.  
- Height declaration: Use `height: 100vh` (not 100% or 100dvh) for correct fullscreen on PWA cold start.  
- JavaScript measurement of `env(safe-area-inset-*)` via DOM probe elements due to WebKit bugs.  
- Device-specific insets for portrait/landscape (e.g., Dynamic Island models: 59–62pt sides in landscape).  
- Undocumented top-edge touch dead zone in landscape; recommend 20px buffer.  
- No Fullscreen API on iPhone; use PWA standalone mode. No orientation lock.  
- Multi-strategy probing with timeouts and viewport-fit toggling for cold-start reliability.

**Important data, statistics, quotes:**  
- Portrait insets examples: No notch (20/0/0/0), Dynamic Island (59/34/0/0).  
- Landscape: Dynamic Island (0/21/59/59).  
- Quote: "The entire safe-area system for web content hinges on a single meta tag."  
- "100vh is the ONLY value that works from cold start."

**Conclusions:**  
iOS web game development requires careful handling of physical constraints and bugs; use probes, specific CSS, and testing across orientations/devices for reliable fullscreen HUDs and canvases.

## Source 3: Game UI/UX Skill
**URL:** https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/game-ui-ux/SKILL.md

**Main topic and thesis:**  
Engine-neutral patterns for designing scalable game HUDs, menus, and overlays that work across devices, inputs (mouse/gamepad), and safe areas using anchors, scaling, and event-driven updates.

**Key points and arguments:**  
- Use anchors + containers (not absolute pixels) for responsive layout.  
- Scaling strategy: Reference resolution with policies for extra space (letterbox/expand).  
- Respect safe areas via OS-reported insets.  
- Keyboard/gamepad focus navigation with initial focus and neighbors.  
- Model screens as a stack (push/pop) rather than boolean flags.  
- Event-driven HUD updates (subscribe to signals) instead of polling.  
- Verification across resolutions, aspects, and input devices.

**Important data, statistics, quotes:**  
- Examples for Godot/Unity: Anchor presets, CanvasScaler with reference 1920x1080.  
- Pitfalls listed: Absolute positions, ignoring safe areas, polling in _process.  
- "UI is unusable on a controller without [focus navigation]."

**Conclusions:**  
Anchor-based, event-driven UI architecture ensures cross-device consistency and maintainability; pair with engine-specific widgets for implementation.

## Source 4: Game UI Patterns
**URL:** https://github.com/chrislaupama/threejs-game-studio/blob/main/references/ui.md

**Main topic and thesis:**  
Best practices for game UI using semantic HTML/CSS overlays on canvas (e.g., Three.js), covering HUD composition, menus, touch controls, responsive constraints, accessibility, and state wiring.

**Key points and arguments:**  
- Prioritize gameplay hierarchy; use semantic DOM for HUD/menus (sharp text, accessibility, safe areas).  
- Required states: HUD, pause, fail, win, loading, touch controls.  
- Zoning: Top-left objective, top-right score/pause, etc.  
- Touch: Pointer events, 44px targets, safe-area insets via CSS env().  
- Responsive: CSS variables, clamp, fixed-width numerics; separate UI scaling from renderer DPR.  
- State wiring: Single source of truth, render only on changes, avoid polling.  
- Accessibility: Reduced motion, focus management, color/shape redundancy.

**Important data, statistics, quotes:**  
- CSS example for safe-area inset HUD: `inset: max(12px, env(safe-area-inset-top)) ...`.  
- Touch targets: "at least roughly 44 CSS pixels".  
- "Separate UI scaling from renderer pixel ratio."

**Conclusions:**  
Semantic overlays + careful layout and event handling create accessible, responsive UIs that complement canvas rendering without common pitfalls like layout shift or input issues.

## Source 5: Corona Invader Game HTML
**URL:** https://github.com/Zyzto/Corona_Invader/blob/master/game.html

**Main topic and thesis:**  
Implementation file for a simple browser-based game (Corona Invader), likely demonstrating canvas usage.

**Key points and arguments:**  
- Minimal content retrieved; appears to be core game HTML structure.

**Important data, statistics, quotes:**  
- No detailed extraction possible from available content.

**Conclusions:**  
Serves as a practical example of canvas-based game implementation.

## Summary
These sources collectively cover critical aspects of modern web game development: automatic canvas letterboxing and scaling for aspect preservation, iOS-specific PWA challenges with safe areas/Dynamic Island/viewport handling, engine-agnostic UI architecture using anchors/events/focus, and semantic HTML overlays for HUDs with accessibility and responsiveness. Key themes include avoiding absolute positioning, respecting device insets, event-driven updates, and cross-device testing. Together they provide actionable patterns for fullscreen, scalable, and playable games on web and mobile.

## All Cited URLs
- https://stackoverflow.com/questions/72148189/automatic-letterbox-scaling-html5-canvas
- https://gist.github.com/fozzedout/5e77925381991a9570151550992baf14
- https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/game-ui-ux/SKILL.md
- https://github.com/chrislaupama/threejs-game-studio/blob/main/references/ui.md
- https://github.com/Zyzto/Corona_Invader/blob/master/game.html