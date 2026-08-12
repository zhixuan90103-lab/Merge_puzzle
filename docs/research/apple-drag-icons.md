---
title: Research Notes
date: 2026-08-11 17:04
query: "iOS home screen icon drag lift animation HIG spring scale shadow Apple Human Interface Guidelines drag and drop"
type: tech,official
sources: 8
model: grok-4-1-fast
generated_by: grok-search
---
**# Apple Human Interface Guidelines on Drag-and-Drop, Motion, and Related UI/Animation Examples**

## Table of Contents
- [Apple HIG: Drag and Drop](#apple-hig-drag-and-drop)
- [Apple Human Interface Guidelines Overview](#apple-human-interface-guidelines-overview)
- [Apple HIG: Motion](#apple-hig-motion)
- [GitHub: liquid_glass_floating_nav](#github-liquid_glass_floating_nav)
- [GitHub: StickerExplode](#github-stickerexplode)
- [GitHub Issue: Elevation System Proposal](#github-issue-elevation-system-proposal)
- [Stack Overflow: Wiggle Animation](#stack-overflow-wiggle-animation)
- [Stack Overflow: Animate Application Icon](#stack-overflow-animate-application-icon)
- [Summary](#summary)

## Apple HIG: Drag and Drop
**URL:** https://developer.apple.com/design/human-interface-guidelines/drag-and-drop

**1. Main topic and thesis**  
Drag and drop enables moving or duplicating content across locations or apps on Apple platforms, with emphasis on intuitive gestures, clear feedback, and consistent behavior.

**2. Key points and arguments**  
- Sources and destinations support same-container moves or cross-container copies.  
- Best practices: Support throughout apps, provide alternatives, handle multi-item drags, allow undos, offer multiple content versions, and support spring loading.  
- Feedback: Use translucent drag images, highlight valid destinations, scroll containers automatically.  
- Platform specifics: iPadOS supports multi-finger gathers; macOS handles background selections and Finder drags; visionOS uses pinch-and-hold with z-axis movement.

**3. Important data, statistics, quotes**  
"People use different interactions to perform drag and drop depending on platform."  
Drag image appears "as soon as people drag a selection about three points."  
Platform note: "Not supported in tvOS or watchOS."

**4. Conclusions**  
Implement drag and drop with system components where possible, prioritize user control through feedback and alternatives, and adapt to platform capabilities for a seamless experience.

## Apple Human Interface Guidelines Overview
**URL:** https://developer.apple.com/design/human-interface-guidelines

**1. Main topic and thesis**  
The HIG provides comprehensive guidance and best practices for designing consistent, high-quality experiences across all Apple platforms.

**2. Key points and arguments**  
Organized into design fundamentals, foundations, patterns, components, inputs, and technologies. Includes sections on getting started, foundations, and what's new.

**3. Important data, statistics, quotes**  
"The HIG contains guidance and best practices that can help you design a great experience for any Apple platform."

**4. Conclusions**  
Follow the HIG to ensure apps feel native and intuitive on iOS, iPadOS, macOS, visionOS, and other platforms.

## Apple HIG: Motion
**URL:** https://developer.apple.com/design/human-interface-guidelines/motion

**1. Main topic and thesis**  
Motion should be purposeful, fluid, and supportive of the interface—conveying status, providing feedback, and enhancing experiences without distraction or discomfort.

**2. Key points and arguments**  
- Best practices: Add motion purposefully, make it optional (supplement with haptics/audio), strive for realistic and brief feedback.  
- Leverage platform capabilities, especially in games (target 30-60 fps).  
- visionOS specifics: Avoid peripheral motion, use fades for relocation, provide stationary frames of reference.  
- watchOS: Use SwiftUI for animations.

**3. Important data, statistics, quotes**  
"Gratuitous or excessive animation can distract people and may make them feel disconnected or physically uncomfortable."  
Change log notes updates for Liquid Glass (Sept 2025) and visionOS guidance.

**4. Conclusions**  
Design motion to feel lightweight, cancellable, and accessible; respect reduce-motion settings and platform differences.

## GitHub: liquid_glass_floating_nav
**URL:** https://github.com/Satyam923/liquid_glass_floating_nav

**1. Main topic and thesis**  
A Flutter package delivering an iOS-style floating "liquid glass" bottom navigation bar with organic bubble animations, drag previews, and frosted-glass effects.

**2. Key points and arguments**  
- Features a single shared liquid capsule that slides/stretches between tabs.  
- Tap commits immediately; drag provides preview but commits only on release.  
- Supports blur (BackdropFilter clipped to bar), magnification, haptics, reduce-motion, and full customization via theme.  
- Pure Flutter, cross-platform, performance-optimized with RepaintBoundary.

**3. Important data, statistics, quotes**  
"Organic liquid bubble/drop: a tapered-superellipse 'lens' shape... with gradient, reflection, rim-light border, soft glow and depth shadow."  
Defaults include height 72, blurSigma 16, slideDuration 360ms.

**4. Conclusions**  
Enables premium, tactile navigation mimicking iOS Liquid Glass while remaining lightweight and accessible.

## GitHub: StickerExplode
**URL:** https://github.com/aldefy/StickerExplode

**1. Main topic and thesis**  
A Compose Multiplatform app demonstrating tactile sticker interactions including drag, pinch-zoom, rotate, haptics, tilt-based holographic shimmer, and spring physics.

**2. Key points and arguments**  
- Stickers support peel-off grab with dynamic shadows, die-cut outlines, and z-ordering.  
- Real-time accelerometer-driven shimmer and native haptics on Android/iOS.  
- Persistence via DataStore; history logging; multi-touch gestures.  
- Built with Kotlin Multiplatform, Material 3, and platform-specific sensor/haptic implementations.

**3. Important data, statistics, quotes**  
"Peel-off grab: Stickers lift + scale when you grab them, with a dynamic drop shadow that grows as they rise."  
16 stickers; full state saved across launches.

**4. Conclusions**  
Provides a reference implementation for realistic, multi-touch sticker canvases with engaging visual and haptic feedback.

## GitHub Issue: Elevation System Proposal
**URL:** https://github.com/facebook/astryx/issues/4146

**1. Main topic and thesis**  
Proposal for an elevation system (content unavailable due to loading error).

**2. Key points and arguments**  
N/A (page failed to load).

**3. Important data, statistics, quotes**  
N/A.

**4. Conclusions**  
N/A.

## Stack Overflow: Wiggle Animation
**URL:** https://stackoverflow.com/questions/3703922/how-do-you-create-a-wiggle-animation-similar-to-iphone-deletion-animation

**1. Main topic and thesis**  
Discussion on implementing iOS-style wiggle (jiggle) animation for deletion mode (content unavailable due to retrieval error).

**2. Key points and arguments**  
N/A.

**3. Important data, statistics, quotes**  
N/A.

**4. Conclusions**  
N/A.

## Stack Overflow: Animate Application Icon
**URL:** https://stackoverflow.com/questions/19361654/how-to-animate-application-icon-in-ios

**1. Main topic and thesis**  
How to animate app icons on iOS (content unavailable due to retrieval error).

**2. Key points and arguments**  
N/A.

**3. Important data, statistics, quotes**  
N/A.

**4. Conclusions**  
N/A.

## Summary
Apple's Human Interface Guidelines emphasize purposeful drag-and-drop with rich feedback, restrained yet realistic motion, and platform-specific behaviors. Complementary open-source examples illustrate practical implementations of liquid/frosted effects, organic animations, tactile stickers, and gesture-driven interactions that align with these principles. Together, they provide a foundation for creating intuitive, delightful iOS-style UIs while prioritizing accessibility, performance, and user control. All listed URLs are referenced above.