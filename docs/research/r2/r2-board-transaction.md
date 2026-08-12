---
title: Research Notes
date: 2026-08-11 16:19
query: "immutable board state clone try move rollback merge puzzle typescript pure logic unit test"
type: tech
sources: 5
model: grok-4-1-fast
generated_by: grok-search
---
**# Immutable Game States and Functional Game Engines in TypeScript/JavaScript**

## Table of Contents
- [bloodfang Repository](#bloodfang-repository)
- [2dnd Repository](#2dnd-repository)
- [makruk-js Repository](#makruk-js-repository)
- [Functional immutable game state (DEV Community)](#functional-immutable-game-state-dev-community)
- [Immutable Data Structures In Games (Medium)](#immutable-data-structures-in-games-medium)
- [Summary](#summary)
- [Sources](#sources)

## bloodfang Repository
**URL:** https://github.com/joaocarmo/bloodfang

**1. Main topic and thesis**  
A grid-based card battle engine and playable game built with TypeScript, pure functions, and immutable state. The project separates a reusable rules engine (`@bloodfang/engine`) from a React-based client with an Ancient Greek mythology theme.

**2. Key points and arguments**  
- Engine uses pure functions and immutable state with zero dependencies.  
- Features grid placement, pawn scoring, card abilities, and lane scoring.  
- Client supports hot-seat multiplayer, 166 original card artworks, and uses React 19, Vite, Tailwind, Zustand, and Motion.  
- Monorepo with pnpm workspaces; extensive testing, linting, and CI via GitHub Actions.

**3. Important data, statistics, quotes**  
- "A grid-based card battle engine and playable game built with TypeScript, pure functions, and immutable state."  
- Engine: pure game logic as a library; Client: complete web client.

**4. Conclusions**  
The project demonstrates a clean, maintainable architecture for strategic card games by leveraging immutability and pure functions for reliable game logic.

## 2dnd Repository
**URL:** https://github.com/mbianchidev/2dnd

**1. Main topic and thesis**  
A browser-based JRPG combining Dragon Quest-style exploration with D&D 5E-inspired combat, implemented entirely in the browser with procedural graphics, synthesized audio, and localStorage saves. Emphasizes immutable inventory sorting and structured combat pipelines.

**2. Key points and arguments**  
- Supports 12 classes, point-buy stats, leveling to 20, companions with independent progression, and gambit-based AI.  
- Turn-based d20 combat with initiative, elements, statuses, and formations.  
- Large world with exploration, quests, crafting, fishing, and persistent state.  
- Immutable sorting for inventories; stable IDs and explicit pipelines for combat actions.

**3. Important data, statistics, quotes**  
- 12 classes; 15 status effects; 9 damage elements; 14 monster families; 39 achievements.  
- "Large hero and companion inventories support immutable sorting by type, value, rarity..."

**4. Conclusions**  
The game showcases complex browser-based RPG mechanics with careful attention to state management, including immutable patterns for inventories and combat resolution.

## makruk-js Repository
**URL:** https://github.com/kaisukez/makruk-js

**1. Main topic and thesis**  
A headless Makruk (Thai chess) library written in TypeScript with AI support, using bitboards and immutable state updates for a pure game logic engine.

**2. Key points and arguments**  
- Immutable: All functions return new state objects.  
- Fast bitboard representation with bitwise operations; supports FEN, PGN, SAN moves, and AI (minimax, iterative deepening).  
- Parallel search support for multi-core environments.  
- Includes counting rules for endgames and 0x88 fallback implementation.

**3. Important data, statistics, quotes**  
- "Immutable - All functions return new state objects."  
- Features full type definitions, zero dependencies (peer: TypeScript), and comprehensive API for moves, status checks, and evaluation.

**4. Conclusions**  
makruk-js provides a high-performance, immutable foundation for Thai chess variants, suitable for both UI integration and AI development.

## Functional immutable game state (DEV Community)
**URL:** https://dev.to/binarykoan/functional-immutable-game-state-2fal

**1. Main topic and thesis**  
Using functional programming and immutable data structures (via Immutable.js) to manage game state enables previewing actions, easy reversion, and safe shared logic between client and server in a turn-based card game.

**2. Key points and arguments**  
- Pure function `performTurn` takes state + chosen cards and returns new state + action list without mutating originals.  
- Enables previews, server persistence, gradual animation, and consistent results across clients.  
- Inspired by "Functional Core, Imperative Shell" pattern; shared TypeScript logic reduces network overhead.

**3. Important data, statistics, quotes**  
- Example: `const newGameState = gameState.setIn(['players', 0, 'hp'], 3);` preserves original state.  
- "Because all the functions involved are pure and idempotent... each client can safely apply the actions without needing constant confirmation from the server."

**4. Conclusions**  
Immutable functional approaches offer surprising advantages for games requiring previews, replays, and distributed state, trading some performance for predictability and debuggability.

## Immutable Data Structures In Games (Medium)
**URL:** https://medium.com/finnovate-io/immutable-data-structures-in-games-3da4e1396b08

**1. Main topic and thesis**  
Immutable data structures, while beneficial for reducing side effects in general apps, become impractical for complex real-time games due to performance costs in frequent state updates during game loops.

**2. Key points and arguments**  
- Simple games like Tic-Tac-Toe tolerate O(n) cloning for moves and undo features.  
- Complex games like Pac-Man with many ticks per second suffer O(n²) complexity when cloning entire states each tick.  
- Mutation achieves O(1) or O(n) updates, enabling smooth gameplay.

**3. Important data, statistics, quotes**  
- "When we can mutate the game state the complexity becomes O(n) and we have an enjoyable gaming experience."  
- Tic-Tac-Toe immutable move: O(n); Pac-Man game loop with immutable state: O(n²).

**4. Conclusions**  
While immutability aids maintainability, mutable state is often necessary for performant game loops in complex titles; developers must weigh trade-offs carefully.

## Summary
These sources collectively highlight the value and challenges of immutable and functional state management in games. GitHub projects (bloodfang, 2dnd, makruk-js) demonstrate practical implementations using pure functions and immutable updates for engines and full games. The articles explore the theoretical benefits (predictability, previews, shared logic) versus performance realities (cloning overhead in loops), advocating hybrid or context-specific approaches.

## Sources
- https://github.com/joaocarmo/bloodfang  
- https://github.com/mbianchidev/2dnd  
- https://github.com/kaisukez/makruk-js  
- https://dev.to/binarykoan/functional-immutable-game-state-2fal  
- https://medium.com/finnovate-io/immutable-data-structures-in-games-3da4e1396b08