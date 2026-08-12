---
title: Research Notes
date: 2026-08-11 17:49
query: "iOS icon drag lift scale shadow spring drop snap animation pointer capture"
type: tech,official,community
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
**Cross-Platform Drag, Drop, Animation, and Icon Design Techniques**

**Table of Contents**

- [Source 1: Drag and drop | Apple Developer Documentation](#source-1-drag-and-drop--apple-developer-documentation)
- [Source 2: Animate symbols in your app - WWDC23](#source-2-animate-symbols-in-your-app---wwdc23)
- [Source 3: Say hello to the new look of app icons - WWDC25](#source-3-say-hello-to-the-new-look-of-app-icons---wwdc25)
- [Source 4: iOS drop shadow PNG animation](#source-4-ios-drop-shadow-png-animation)
- [Source 5: Javascript drag and drop not working with pointer events](#source-5-javascript-drag-and-drop-not-working-with-pointer-events)
- [Source 6: Pointer events - Web APIs | MDN](#source-6-pointer-events---web-apis--mdn)
- [Summary](#summary)
- [All URLs Cited](#all-urls-cited)

### Source 1: Drag and drop | Apple Developer Documentation
**URL:** https://developer.apple.com/documentation/uikit/drag-and-drop

**Main topic and thesis:** UIKit support for implementing drag-and-drop interactions in iOS/macOS apps.

**Key points and arguments:** (Content unavailable due to JavaScript requirement on the page.)

**Important data, statistics, quotes:** N/A

**Conclusions:** N/A (page content could not be extracted).

### Source 2: Animate symbols in your app - WWDC23
**URL:** https://developer.apple.com/videos/play/wwdc2023/10258/

**Main topic and thesis:** Introduction to the new Symbols framework and symbol effects for animating SF Symbols in SwiftUI, UIKit, and AppKit on iOS 17/macOS Sonoma.

**Key points and arguments:** 
- Seven universal animations (Bounce, Pulse, Variable Color, Scale, Appear, Disappear, Replace) available via a unified API.
- Effects categorized by behavior: discrete (one-off), indefinite (continuous until removed), transition, and content transition.
- Simple dot-syntax configuration (e.g., `.variableColor.iterative.reversing`); compile-time safety and Xcode autocomplete.
- APIs: `symbolEffect` modifier in SwiftUI; `addSymbolEffect`/`removeSymbolEffect`/`setSymbolImage` in UIKit/AppKit.
- Support for combining effects, repeat counts, `isActive` boolean control, and integration with `transition` modifier.
- Built-in animations in controls like `UISlider`; propagation and disabling via modifiers.

**Important data, statistics, quotes:** 
- "SF Symbols are an iconic part of Apple interfaces."
- "These animations are called Bounce, Pulse, Variable Color, Scale, Appear, Disappear, and Replace."
- "The effect names are real Swift code. There's no strings attached."

**Conclusions:** Symbol effects bring delightful, hardware-agnostic animations to apps. Use the SF Symbols app to explore options, adopt the new APIs, and combine with existing UI for more intuitive interfaces. Related sessions recommended for custom symbols and HIG.

### Source 3: Say hello to the new look of app icons - WWDC25
**URL:** https://developer.apple.com/videos/play/wwdc2025/220/

**Main topic and thesis:** Overview of the redesigned app icon system for iOS, iPadOS, macOS, watchOS using "liquid glass" material with light/dark tints, translucency, frostiness, and gyro-based specular highlights.

**Key points and arguments:** 
- Unified design system and grid for rounded rectangles and circles across platforms; simplified spacing and rounder corners.
- Material layers (edge highlights, frostiness, translucency) create depth and internal lighting; works in light/dark modes and new monochrome/tint appearances.
- Layering best practices: multiple foreground layers preferred; favor flat/frontal views over realistic 3D to complement glass effects.
- Translucency and blur add nuance; avoid sharp edges/thin lines; use bolder weights and softer gradients.
- Automatic masking/scaling for legacy icons; templates available in Figma/Sketch/etc.

**Important data, statistics, quotes:** 
- "We drew inspiration from the layered icons on visionOS and researched real glass properties to then combine that into this liquid glass material."
- "All appearance modes are available on iPhone, iPad and Mac. And even on your Apple Watch..."
- "The new design language for app icons emphasizes the effective use of layering, translucency, and blurs."

**Conclusions:** The new material makes icons more vibrant and expressive. Redesign for the updated grid/canvas to fully utilize effects; templates and guidelines ensure consistency across devices and the App Store.

### Source 4: iOS drop shadow PNG animation
**URL:** https://stackoverflow.com/questions/35084908/ios-drop-shadow-png-animation

**Main topic and thesis:** (Content unavailable; page retrieval failed.)

**Key points and arguments:** N/A

**Important data, statistics, quotes:** N/A

**Conclusions:** N/A

### Source 5: Javascript drag and drop not working with pointer events
**URL:** https://stackoverflow.com/questions/77482267/javascript-drag-and-drop-not-working-with-pointer-events

**Main topic and thesis:** (Content unavailable; page retrieval failed.)

**Key points and arguments:** N/A

**Important data, statistics, quotes:** N/A

**Conclusions:** N/A

### Source 6: Pointer events - Web APIs | MDN
**URL:** https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

**Main topic and thesis:** Unified DOM event model for handling all pointing devices (mouse, pen/stylus, touch) via the PointerEvent interface.

**Key points and arguments:** 
- Pointer events mirror mouse events (`pointerdown`, `pointermove`, `pointerup`, etc.) but add device-agnostic properties (`pointerId`, `pointerType`, `pressure`, `tiltX`/`tiltY`, `width`/`height`, etc.).
- Supports pointer capture (`setPointerCapture`, `releasePointerCapture`) and events like `gotpointercapture`/`lostpointercapture`.
- `pointerType` distinguishes input ("mouse", "pen", "touch"); `isPrimary` identifies the main pointer.
- Additional events: `pointercancel`, `pointerrawupdate`, `pointerenter`/`pointerleave`.
- Extensions to Element and Navigator (`maxTouchPoints`).

**Important data, statistics, quotes:** 
- "Pointer events address that need" for multi-device pointing input.
- "The pointer is a hardware-agnostic device that can target a specific set of screen coordinates."
- Baseline: Widely available since July 2020.

**Conclusions:** Pointer events provide a single, future-proof model for cross-device input, simplifying development while preserving device-specific details when needed. Migrate from mouse events easily due to inheritance.

### Summary
The sources collectively cover UIKit drag-and-drop foundations, advanced symbol and app icon animation/material design on Apple platforms (WWDC23/25), and web pointer event handling for cross-input drag-and-drop scenarios. Key themes include unified APIs, device-agnostic abstractions, layering/translucency for visual polish, and best practices for smooth, delightful interactions. Missing Stack Overflow and partial Apple doc content limits web/iOS-specific troubleshooting details, but available transcripts and MDN docs provide strong guidance on implementation and design principles.

### All URLs Cited
- https://developer.apple.com/documentation/uikit/drag-and-drop
- https://developer.apple.com/videos/play/wwdc2023/10258/
- https://developer.apple.com/videos/play/wwdc2025/220/
- https://stackoverflow.com/questions/35084908/ios-drop-shadow-png-animation
- https://stackoverflow.com/questions/77482267/javascript-drag-and-drop-not-working-with-pointer-events
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events