---
title: Research Notes
date: 2026-08-11 16:15
query: "polyomino merge game drag drop grid footprint multi-cell tile puzzle prototype"
type: tech,community
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
**# Polyomino Tiling Games and Solvers: GitHub Project Overview**

## Table of Contents
- [Tiling Polyominoes Game](#tiling-polyominoes-game)
- [Polyomino Puzzle Game & Solver (智慧拼盤)](#polyomino-puzzle-game--solver-智慧拼盤)
- [Polyomino-Tangram](#polyomino-tangram)
- [Shapebound - A Relaxing Polyomino Puzzle Game for GNOME](#shapebound---a-relaxing-polyomino-puzzle-game-for-gnome)
- [polyomino-puzzle-solver](#polyomino-puzzle-solver)
- [polyomino-solver](#polyomino-solver)
- [Summary](#summary)

## Tiling Polyominoes Game
**URL:** https://github.com/jwass91/tilingpolyominoesgame

**Main Topic and Thesis**  
A Mathematica-based interactive game where users tile a randomly generated shape using a provided set of polyominoes (4–8 squares each). The thesis centers on creating an engaging puzzle experience through random generation, rotation, and placement mechanics.

**Key Points and Arguments**  
- Randomly generates tiled shapes on a grid with polyominoes rotated in 90-degree increments.  
- Difficulty levels 1–5 increase the number of blocks and grid size.  
- Users click to place pieces, drag to move, and click shaded versions to rotate.  
- Success triggers a congratulations message with completion time.  
- Linked to Wolfram Demonstrations site for broader access.

**Important Data, Statistics, Quotes**  
- "Polyominoes are a collection of n squares of equal size that are arranged with coincident sides. Think of them as an extension of dominoes."  
- 0 stars, 1 watcher, 0 forks (as of data extraction).

**Conclusions**  
The project demonstrates a functional, educational tiling game in Mathematica, emphasizing user interaction with polyomino placement and rotation for recreational math exploration.

## Polyomino Puzzle Game & Solver (智慧拼盤)
**URL:** https://github.com/SimonHung/Polyomino-Puzzle

**Main Topic and Thesis**  
A JavaScript + KineticJS web application providing both a playable polyomino puzzle game (including pentominoes) and an integrated solver.

**Key Points and Arguments**  
- Supports tetrominoes, pentominoes, and general polyominoes.  
- Includes demo pages for solver (https://simonhung.github.io/Polyomino-Puzzle/polyomino.html) and playable game (https://simonhung.github.io/Polyomino-Puzzle/pentomino.puzzle.html).  
- References Wikipedia entries on polyominoes, pentominoes, and tetrominoes.

**Important Data, Statistics, Quotes**  
- 8 stars, 2 watchers, 3 forks.  
- Built entirely with client-side JavaScript for browser-based interaction.

**Conclusions**  
The repository delivers accessible online tools for both playing and solving polyomino puzzles, highlighting practical web implementation of tiling concepts.

## Polyomino-Tangram
**URL:** https://github.com/subramanya1997/Polyomino-Tangram

**Main Topic and Thesis**  
A Python/Flask web implementation of a Tangram-style puzzle using polyominoes instead of traditional shapes, with progressive tasks for visualization, rotation, and blocked cells.

**Key Points and Arguments**  
- Task 1: Drag-and-drop polyominoes (up to pentominoes) onto a 10x10 grid to fill a full row or column; random selection of pieces and count.  
- Task 2: Adds clockwise rotation via button.  
- Task 3: Introduces randomly blocked (black) squares that invalidate invalid placements.  
- Controls: Double-click to rotate; toggle blocks for random obstacles.  
- Run via `python app.py` after installing requirements.

**Important Data, Statistics, Quotes**  
- "The Tangram is a puzzle where the user must arrange geometric shapes to completely fill a square."  
- 3 stars, 1 watcher, 0 forks.  
- Includes PDF problem statement and answers.

**Conclusions**  
The project successfully prototypes an educational polyomino-based Tangram variant with escalating complexity, demonstrating core mechanics for placement, rotation, and obstacle handling.

## Shapebound - A Relaxing Polyomino Puzzle Game for GNOME
**URL:** https://github.com/Lluciocc/Shapebound

**Main Topic and Thesis**  
A relaxing, level-based polyomino puzzle game built for the GNOME desktop environment using GTK4 and Python.

**Key Points and Arguments**  
- Goal: Fill the board completely with polyomino pieces while avoiding walls and blocked spaces.  
- Increasing difficulty requires strategic combination of shapes and rotations for unique solutions.  
- Available on Flathub; licensed under GPL-3.0+.  
- Focuses on calm, meditative gameplay.

**Important Data, Statistics, Quotes**  
- "Place the available polyomino pieces to completely fill the board while avoiding walls and blocked spaces."  
- 0 stars, 0 watchers, 0 forks (early-stage project).

**Conclusions**  
Shapebound offers a polished, desktop-native polyomino experience emphasizing relaxation and logical progression over competitive elements.

## polyomino-puzzle-solver
**URL:** https://github.com/dmarchuk/polyomino-puzzle-solver

**Main Topic and Thesis**  
A TypeScript web solver for polyomino puzzles using the Dancing Links (DLX) algorithm to solve exact cover problems, with full configurability for pieces and board size.

**Key Points and Arguments**  
- Reduces tiling to exact cover; supports custom pieces via coordinate arrays and board dimensions.  
- Demo at https://dmarchuk.github.io/polyomino-puzzle-solver/.  
- Includes example solutions, loading, and iterative solving for multiple solutions.  
- References Knuth’s Dancing Links lecture and related exact cover resources.

**Important Data, Statistics, Quotes**  
- "This was done for fun to better understand this interesting problem related to 'exact cover' problem."  
- 3 stars, 2 watchers, 0 forks.  
- Extensive API documentation for `addPiece`, `createSolver`, `solve`, etc.

**Conclusions**  
The solver provides a robust, educational implementation of Algorithm X for polyomino tiling, suitable for experimentation and deeper algorithmic study.

## polyomino-solver
**URL:** https://github.com/cemulate/polyomino-solver

**Main Topic and Thesis**  
A web application that solves arbitrary polyomino (including tetromino) fitting problems on custom regions using multiple algorithms, primarily Knuth’s Algorithm X / Dancing Links.

**Key Points and Arguments**  
- Primary method: Exact Cover via DLX (with support for inexact solutions via placeholders).  
- Legacy methods: Conversion to SAT and SMT (Z3 WebAssembly) for comparison.  
- Users construct custom polyominoes and target regions; displays valid tilings.  
- Demo at https://cemulate.github.io/polyomino-solver.  
- Uses web-component-polyomino for rendering.

**Important Data, Statistics, Quotes**  
- "Knuth's 'Algorithm X' (implemented with 'Dancing Links') is the best algorithm to handle this problem."  
- 61 stars, 3 watchers, 13 forks (most popular of the set).  
- Notes NP-completeness of general tiling problems.

**Conclusions**  
This mature project delivers a versatile, high-performance polyomino solver with multiple algorithmic backends, excelling in flexibility and performance for complex tiling instances.

## Summary
These six GitHub repositories collectively illustrate the spectrum of polyomino applications—from casual interactive games (Mathematica, JavaScript, GNOME, Python/Flask) to sophisticated algorithmic solvers (TypeScript DLX, multi-method web app). Common themes include random generation, drag-and-drop/rotation mechanics, exact cover reduction, and educational visualization of tiling problems. The solver projects emphasize Dancing Links/Algorithm X, while games prioritize user experience and progressive difficulty. All URLs are directly referenced above; projects range from minimal prototypes to feature-rich demos with live web versions.