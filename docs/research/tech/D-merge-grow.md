---
title: Research Notes
date: 2026-08-11 17:49
query: "rect grow animation one side anchor FLIP layout morph same element merge tile"
type: tech,community
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
**Layout Animations, FLIP Technique, and Shared Element Transitions: A Comprehensive Overview**

## Table of Contents

- [Motion.dev: Layout Animation | React FLIP & Shared Element](#motiondev-layout-animation--react-flip--shared-element)
- [Maxime Heckel: Everything about Framer Motion layout animations](#maxime-heckel-everything-about-framer-motion-layout-animations)
- [NaN.fyi: Inside Framer's Magic Motion](#nanfyi-inside-framers-magic-motion)
- [Medium: FLIP animation in React](#medium-flip-animation-in-react)
- [DEV.to: How I built a "Magic Move" animation engine for Excalidraw](#devto-how-i-built-a-magic-move-animation-engine-for-excalidraw-from-scratch)
- [GitHub: realmeylisdev/layout_motion](#github-realmeylisdevlayout_motion)
- [Summary](#summary)
- [References](#references)

## Motion.dev: Layout Animation | React FLIP & Shared Element

**Main topic and thesis**: The guide explains how Motion (formerly Framer Motion) enables automatic layout animations and shared element transitions in React using the `layout` and `layoutId` props, leveraging the FLIP technique under the hood for performant, transform-based animations.

**Key points and arguments**:
- Add `layout` prop to animate size/position changes on render.
- Use `layoutId` for shared element transitions (e.g., tab underlines, modals).
- Customizable via `transition` prop (including dedicated `layout` transitions and `arc()` paths).
- Advanced features: `layoutScroll`, `layoutRoot`, `LayoutGroup` for synchronized animations, `layoutAnchor`, and distortion fixes (e.g., borders, children).
- Compares favorably to View Transitions API in flexibility and file size vs. browser-native snapshots.

**Important data, statistics, quotes**:
- "Motion performs all layout animations using the CSS `transform` property for the highest possible performance."
- Layout animations handle previously unanimatable properties like `justify-content`.
- Troubleshooting covers inline elements, window resizes, SVGs, and scrollbar effects.

**Conclusions**: Layout animations provide seamless, high-performance UI transitions with minimal code; advanced props and groups handle complex scenarios reliably.

**Source**: https://motion.dev/docs/react-layout-animations

## Maxime Heckel: Everything about Framer Motion layout animations

**Main topic and thesis**: A deep dive into Framer Motion's layout animations, covering fundamentals, variants of the `layout` prop, shared animations with `layoutId`, `LayoutGroup`, distortion fixes, and integration with `AnimatePresence` for polished effects.

**Key points and arguments**:
- `layout` prop animates between layouts on re-render (unlike `initial`/`animate`).
- Variants: `layout="position"` or `"size"` to avoid content distortion.
- Shared animations use matching `layoutId` for "magic" cross-component transitions (crossfade when both instances exist).
- `LayoutGroup` synchronizes animations across non-simultaneously re-rendering components.
- Practical examples include notification lists, selectable lists, and tabs with hover/selected indicators.

**Important data, statistics, quotes**:
- Emphasizes physicality: "Layout animations 'smooth things up', and add a certain level of physicality to some user interactions."
- Distortions on `borderRadius`/`boxShadow` fixed by setting as inline styles.
- Multiple interactive playgrounds demonstrate before/after behavior.

**Conclusions**: With tips, variants, and combinations (e.g., `AnimatePresence`), layout animations elevate UX from abrupt to delightful; the post serves as a comprehensive reference.

**Source**: https://blog.maximeheckel.com/posts/framer-motion-layout-animations/

## NaN.fyi: Inside Framer's Magic Motion

**Main topic and thesis**: An in-depth technical explanation of how Framer Motion implements layout animations via the FLIP technique to animate "slow" layout changes (position, size, even `justify-content`) using fast `transform` properties.

**Key points and arguments**:
- Layout changes affect other elements (unlike transforms); CSS transitions on layout properties are expensive due to per-frame recalculation.
- FLIP steps: **First** (measure initial), **Last** (measure final), **Inverse** (apply delta transform), **Play** (animate transform to zero).
- Detailed React/`useLayoutEffect` implementations for position and size (using `scale` for size inversion).
- Handles performance by avoiding layout thrashing; supports un-animatable properties.

**Important data, statistics, quotes**:
- "FLIP... lets you animate 'un-animatable' properties like `justify-content` too!"
- Performance contrast: CSS layout animations require 60 recalculations per second at 60 FPS; transforms do not.
- Interactive demos illustrate each FLIP phase with live measurements.

**Conclusions**: FLIP is the core "magic" enabling performant, seamless layout animations; understanding the four steps demystifies the implementation and highlights why it outperforms direct CSS approaches.

**Source**: https://www.nan.fyi/magic-motion

## Medium: FLIP animation in React

**Main topic and thesis**: Practical implementation of FLIP animations in React using hooks for list reordering/add/remove, avoiding expensive layout recalculations by pre-computing transforms.

**Key points and arguments**:
- Steps mirror classic FLIP: measure First/Last via `getBoundingClientRect`, compute delta, invert with `transform`, play via transition or Web Animations API.
- Custom hook `useFlip` with `useLayoutEffect` for timing (post-layout, pre-paint).
- Uses `data-key` for element identification; `firstRun` ref avoids initial animations.
- Recommends `react-flip-toolkit` for production reliability (handles edge cases like mid-animation re-renders).

**Important data, statistics, quotes**:
- "To avoid that [layout penalty], we *pre-calculate* the transition... and then let it run smoothly."
- Code examples include `getDelta`, `invert`, `play` functions with 300ms ease transitions.
- `requestAnimationFrame` ensures invert applies before play.

**Conclusions**: Pure hook implementation works for simple cases, but libraries like react-flip-toolkit are essential for robust, production-grade FLIP animations in React lists and beyond.

**Source**: https://medium.com/makers-den/flip-animation-in-react-1a333142d8c1

## DEV.to: How I built a "Magic Move" animation engine for Excalidraw

**Main topic and thesis**: Building a custom "Magic Move"/keyless animation engine for diagrams in Excalidraw using state diffing, interpolation, and a custom render loop (inspired by shared layout/FLIP concepts) to automatically transition between frames.

**Key points and arguments**:
- Core: Diff states into stable/morphed/entering/exiting buckets via ID maps.
- Interpolation handles numbers, colors (RGBA), and shortest-path angles.
- Overlapping animation phases (exit → morph → enter with overlap) for natural "Apple Keynote" feel.
- Spring-like easing and `requestAnimationFrame` loop for 60 FPS canvas rendering; supports physical weight via quartic ease-out.

**Important data, statistics, quotes**:
- "Keyless Animation": Draw Frame 1, clone to Frame 2, move elements—the engine figures out the rest.
- Overlap duration example: 200ms for entering elements starting before morph ends.
- Performance note: 60 FPS can strain older devices during screen recording.

**Conclusions**: State diffing + smart interpolation + phased/overlapped timing creates professional diagram animations; the approach adapts FLIP/shared-layout ideas to canvas for storytelling use cases.

**Source**: https://dev.to/behruamm/how-i-built-a-magic-move-animation-engine-for-excalidraw-from-scratch-published-4lmp

## GitHub: realmeylisdev/layout_motion

**Main topic and thesis**: A Flutter package (`layout_motion`) providing zero-config automatic FLIP layout animations for common widgets (Column, Row, Wrap, etc.), including add/remove/reorder, shared elements, and scroll-triggered effects.

**Key points and arguments**:
- Wrap layouts with `MotionLayout`; children require unique `Key`s for diffing.
- Supports staggered animations, spring physics, transition composition (`+` operator), drag-to-reorder, size morphing, and `MotionLayoutScope`/`MotionLayoutId` for shared elements.
- GPU-accelerated via transforms; respects reduced motion; interruption-safe.
- Additional widgets: `MotionListView`, `MotionGridView`, `ScrollAwareMotionLayout`.

**Important data, statistics, quotes**:
- "Zero-config — wrap your layout widget with MotionLayout and you're done."
- Features include spring presets (bouncy, gentle, etc.), per-child curves, and lifecycle callbacks.
- Changelog notes on v0.4.0 reduced-motion handling.

**Conclusions**: The package delivers production-ready, accessible FLIP animations across Flutter layouts with extensive customization, making complex transitions effortless.

**Source**: https://github.com/realmeylisdev/layout_motion

## Summary

These sources collectively cover the theory (FLIP fundamentals), implementation (React hooks, Framer Motion/Motion props), advanced patterns (shared elements, groups, distortion fixes), and cross-platform applications (Flutter package, custom canvas engine). The core insight is that FLIP enables performant, automatic animations of layout changes by inverting them into fast transforms. Framer Motion/Motion abstracts this elegantly for React, while libraries and custom engines extend it to lists, diagrams, and Flutter widgets. Key benefits include reduced cognitive load, physicality in UIs, and minimal developer effort for complex transitions. Performance considerations (transforms vs. layout thrashing) and accessibility (reduced motion) are consistently emphasized.

## References

- https://motion.dev/docs/react-layout-animations
- https://blog.maximeheckel.com/posts/framer-motion-layout-animations/
- https://www.nan.fyi/magic-motion
- https://medium.com/makers-den/flip-animation-in-react-1a333142d8c1
- https://dev.to/behruamm/how-i-built-a-magic-move-animation-engine-for-excalidraw-from-scratch-published-4lmp
- https://github.com/realmeylisdev/layout_motion