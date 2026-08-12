---
title: Research Notes
date: 2026-08-11 17:49
query: "sokoban push one step multiple boxes same direction outward order fail rollback"
type: tech,community
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
# Sokoban Search Algorithms, Visualizers, and Implementations

## Table of Contents
- [Basic Search Algorithms on Sokoban](#basic-search-algorithms-on-sokoban)
- [Sokoban Visualizer Help](#sokoban-visualizer-help)
- [torogmw/sokoban-planner](#torogmwsokoban-planner)
- [Michail-Marakis/Sokoban-AStar-and-DRL](#michail-marakissokoban-astar-and-drl)
- [paskhaver/sokoban](#paskhaversokoban)
- [rosasbehoundja/sokoban-game](#rosasbehoundjasokoban-game)
- [Summary](#summary)
- [References](#references)

## Basic Search Algorithms on Sokoban
**Source:** https://timallanwheeler.com/blog/2022/01/19/basic-search-algorithms-on-sokoban/

### Main Topic and Thesis
Exploration of basic search algorithms (primarily depth-first search and improvements) applied to Sokoban puzzles, demonstrating how algorithmic refinements yield order-of-magnitude performance gains in solving block-pushing problems.

### Key Points and Arguments
- Sokoban modeled as a shortest-path search problem using push moves (coarser than individual player moves) for efficiency.
- State representation uses static `Game` struct (walls, goals) and dynamic `State` struct (player position, boxes, board).
- Depth-first search implemented with recursive helper, reachability calculations, and move/undo operations; solves simple 2-box levels quickly but struggles with harder ones and does not guarantee optimality.
- Deadlocks (e.g., boxes in corners) are a major challenge; push-based reasoning avoids some issues.
- Code examples in Julia highlight practical implementation details like bit-field tiles and reversible moves.

### Important Data, Statistics, Quotes
- DFS on simple 2-box problem: solved=true, max_depth=12, n_pushes_evaled=38, solve_time=2.193450927734375e-5s, sol_depth=8.
- Quote: "It was really stark to see how the additions in each new algorithm causes order-of-magnitude changes in solver capability."
- References YASS solver and Virkkala’s thesis on Sokoban solving.

### Conclusions
Basic search provides a solid baseline; progressive improvements (e.g., heuristics, better state pruning) dramatically enhance solvability for complex Sokoban instances. Code available for further experimentation.

## Sokoban Visualizer Help
**Source:** https://www.cs.virginia.edu/~rmw7my/sokoban/help.html

### Main Topic and Thesis
Documentation for a web-based Sokoban puzzle visualizer supporting custom puzzle/solution formats, manual recording, playback, and multi-agent extensions.

### Key Points and Arguments
- Puzzle format uses symbols: # (wall), space (floor), . (goal), @ (player), $ (box), +/* (player/box on goal); supports numbered multiple players/boxes.
- Solution format supports moves (l/r/u/d), pushes (L/R/U/D), box-specific commands (b N DIR), and coordinate moves (m/M).
- Features include recording/playback modes (step, auto slow/medium/fast), multi-box push relaxation, and example loading.
- Alternative numeric-only solution format converts to M commands.

### Important Data, Statistics, Quotes
- "The classic sokoban rules are generalized to allow multiple sokoban."
- Cell numbering: row = floor(cell / number columns), column = cell mod number columns (0-based).
- Source code link: https://gitlab.com/HenryKautz/sokobanvisualizer.

### Conclusions
The visualizer facilitates puzzle creation, solution verification, and experimentation with generalized/multi-agent Sokoban variants through flexible file formats and interactive controls.

## torogmw/sokoban-planner
**Source:** https://github.com/torogmw/sokoban-planner

### Main Topic and Thesis
C++ Sokoban planner using reverse search (pull actions from goal state) and BFS to avoid explicit deadlock detection, implemented with a JUCE GUI for visualization.

### Key Points and Arguments
- Transforms pushes into pulls: precondition is box in front and empty space behind player.
- BFS-based search prioritizes directions inspired by bug algorithms; checks nearest box and initial positions for efficiency.
- Handles multiple boxes without labeling; avoids deadlock checks by backward planning.
- UI for plan visualization and testing.

### Important Data, Statistics, Quotes
- "It is faster than the PDDL planners."
- "By considering a plan as a sequence of “pull” actions from the target destination to its initial state, the box will never in a state of deadlock."
- Repository stats: 3 stars, 2 watchers, 0 forks (as of data retrieval).

### Conclusions
Reverse BFS with pull actions provides an efficient, deadlock-free approach to Sokoban planning, suitable for visualization and outperforming certain PDDL-based methods.

## Michail-Marakis/Sokoban-AStar-and-DRL
**Source:** https://github.com/Michail-Marakis/Sokoban-AStar-and-DRL

### Main Topic and Thesis
Hybrid solver combining A* search with deep reinforcement learning (PPO in Gymnasium) for Sokoban, including Java Swing GUI for A* and plans for pygame frontend.

### Key Points and Arguments
- A* implementation for classical search; DRL agent trained via PPO in custom environment.
- Goal: push all boxes to targets (1:1 correspondence, no multiples per target).
- Supports level selection by difficulty; outputs sequential moves or failure notification.
- Topics include A*, BFS, DFS, IDS, and RL.

### Important Data, Statistics, Quotes
- "An AI-based solver for the classic Sokoban puzzle."
- Separate repos linked for A* and DRL components.
- Repository stats: 1 star, 0 watchers, 2 forks.

### Conclusions
Combines traditional heuristic search (A*) with modern RL for robust Sokoban solving; GUI support enhances usability and future interactivity.

## paskhaver/sokoban
**Source:** https://github.com/paskhaver/sokoban

### Main Topic and Thesis
Browser-based Sokoban implementation in JavaScript (ES6) + Easel.js featuring 30 levels, dynamic rendering, and UI controls for an engaging puzzle experience.

### Key Points and Arguments
- Game elements: player, boxes, goals, walls; goal is to push all boxes to checkpoints without trapping them.
- Features: level menu, reset/skip, step/box-push counters, Easel.js for grid rendering.
- DRY movement handling for four directions; multi-dimensional array parsing for levels.

### Important Data, Statistics, Quotes
- "30 levels of varying difficulty."
- Live demo: https://paskhaver.github.io/sokoban/
- Repository stats: 9 stars, 0 watchers, 2 forks.

### Conclusions
A complete, playable web Sokoban game emphasizing clean code, user-friendly features, and progressive difficulty across multiple levels.

## rosasbehoundja/sokoban-game
**Source:** https://github.com/rosasbehoundja/sokoban-game

### Main Topic and Thesis
Python Sokoban solver and game using AI search algorithms (DFS, BFS, A*, GBFS) with custom heuristics, developed as a course project.

### Key Points and Arguments
- Implements game rules (push-only, no wall/box traversal) and solvers via solve.py.
- Heuristics: Manhattan distance (fast, simple) and greedy matching (avoids over-assignment).
- Supports level loading, algorithm selection, and heuristic choice via command line.
- Includes tests, levels, and documentation.

### Important Data, Statistics, Quotes
- "Sokoban Game solving using AI Algorithms (DFS, BFS, A*, etc)"
- Heuristic recommendations: Manhattan for simple levels, greedy matching for complex.
- Example: `python solve.py -l 01 -m astar -hu greedy_matching`
- Repository stats: 0 stars, 1 watcher, 0 forks.

### Conclusions
Educational project demonstrating comparative performance of uninformed and informed search algorithms on Sokoban, with practical heuristics for varying difficulties.

## Summary
These sources collectively cover Sokoban from theoretical search algorithm implementations (DFS, A*, BFS variants) and optimizations (push/pull reasoning, deadlock avoidance, heuristics) to practical tools (visualizers, solvers in multiple languages) and playable games. Key themes include efficiency gains from state abstraction, reverse planning, and heuristics, alongside educational and interactive applications. Performance varies dramatically with algorithmic sophistication, as illustrated by rapid solving of simple levels versus challenges on complex ones.

## References
- https://timallanwheeler.com/blog/2022/01/19/basic-search-algorithms-on-sokoban/
- https://www.cs.virginia.edu/~rmw7my/sokoban/help.html
- https://github.com/torogmw/sokoban-planner
- https://github.com/Michail-Marakis/Sokoban-AStar-and-DRL
- https://github.com/paskhaver/sokoban
- https://github.com/rosasbehoundja/sokoban-game