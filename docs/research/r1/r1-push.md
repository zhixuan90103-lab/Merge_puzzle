---
title: Research Notes
date: 2026-08-11 16:18
query: "sokoban push pieces off board merge grow multi tile collision resolve transaction rollback"
type: tech,community
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
**Sokoban Variants, Implementations, and AI Environments: Custom Mechanics, Collision Handling, and Reinforcement Learning**

# Table of Contents
- [Sokenban: Sokoban with Multiple Tile Large Boxes and Recursive Pushing](https://ken.garstin.ca/2023/08/07/sokoban-type-game/)
- [Basic Search Algorithms on Sokoban](https://timallanwheeler.com/blog/2022/01/19/basic-search-algorithms-on-sokoban/)
- [Collision with walls in a completely tile based game](https://gamedev.stackexchange.com/questions/178376/collision-with-walls-in-a-completely-tile-based-game)
- [Sokoban - Pushing Objects?](https://www.reddit.com/r/gamemaker/comments/tzyzr9/sokoban_pushing_objects/)
- [gym-sokoban: Sokoban environment for OpenAI Gym](https://github.com/mpschrader/gym-sokoban)
- [Merge. Split. Move Forward.](https://www.reddit.com/r/sokoban/comments/1ushlkz/merge_split_move_forward/)
- [Summary](#summary)
- [Sources](#sources)

## Sokenban: Sokoban with Multiple Tile Large Boxes and Recursive Pushing
**URL:** https://ken.garstin.ca/2023/08/07/sokoban-type-game/

**1. Main topic and thesis**  
Exploration of a custom Sokoban variant ("Sokenban") featuring multi-tile boxes that move as groups, recursive pushing of stacked boxes, and special tiles (spikes/posts). The thesis advocates simulating moves first then undoing invalid ones using existing undo mechanics, rather than pre-checking legality.

**2. Key points and arguments**  
- Boxes labeled by letter move together; pushing one may trigger recursive pushes of other groups.  
- Pre-validating moves is nearly impossible due to complex interactions.  
- Simulate the full move (ignoring obstacles), record it, then validate and auto-undo if illegal (boxes on walls/posts or player on spikes).  
- Leverages built-in undo system for efficiency and consistency.

**3. Important data, statistics, quotes**  
- "it is nearly impossible to know ahead of time whether or not a move by the pusher would result in an illegal position before actually simulating that move."  
- Emphasizes that the "inefficient" simulation approach is "consistent" and elegant.

**4. Conclusions**  
Simulation + auto-undo is the practical implementation strategy for complex Sokoban variants.

## Basic Search Algorithms on Sokoban
**URL:** https://timallanwheeler.com/blog/2022/01/19/basic-search-algorithms-on-sokoban/

**1. Main topic and thesis**  
Application of fundamental search algorithms (BFS, DFS, etc.) to solve Sokoban puzzles programmatically.

**2. Key points and arguments**  
- Discussion of state representation, move generation, and search strategies tailored to Sokoban’s irreversible pushes.  
- Comparison of algorithm performance on puzzle solving.

**3. Important data, statistics, quotes**  
(Details limited due to retrieval issues; focuses on algorithmic efficiency in puzzle domains.)

**4. Conclusions**  
Basic searches provide foundational approaches for automated Sokoban solving.

## Collision with walls in a completely tile based game
**URL:** https://gamedev.stackexchange.com/questions/178376/collision-with-walls-in-a-completely-tile-based-game

**1. Main topic and thesis**  
Handling tile-based collision detection, particularly with walls, in grid-aligned games like Sokoban.

**2. Key points and arguments**  
- Techniques for preventing movement into walls using tilemap checks.  
- Integration with object movement and pushing logic.

**3. Important data, statistics, quotes**  
(Details limited due to retrieval issues.)

**4. Conclusions**  
Tilemap-based collision is essential for reliable Sokoban-style movement.

## Sokoban - Pushing Objects?
**URL:** https://www.reddit.com/r/gamemaker/comments/tzyzr9/sokoban_pushing_objects/

**1. Main topic and thesis**  
Practical implementation of box-pushing mechanics in GameMaker Studio 2 for a Sokoban game.

**2. Key points and arguments**  
- Player movement and tilemap collision already implemented.  
- Need logic to detect adjacent boxes and move them when pushed.  
- Suggestions include `place_meeting()`, target coordinates with lerping for smooth movement, and checking free space ahead.

**3. Important data, statistics, quotes**  
- Example code snippet for checking push direction and updating `target_x`/`target_y`.  
- "I got it working" after applying the suggested approach.

**4. Conclusions**  
Simple collision checks combined with target-based movement enable basic Sokoban pushing.

## gym-sokoban: Sokoban environment for OpenAI Gym
**URL:** https://github.com/mpschrader/gym-sokoban

**1. Main topic and thesis**  
Open-source Gym environment implementing Sokoban for reinforcement learning research, with random level generation and configurable variants.

**2. Key points and arguments**  
- 9 actions (move/push in 4 directions + noop).  
- Rewards: -0.1 per step, +1/-1 for box on/off target, +10 for completion.  
- Random room generation via random walk + reverse play (DFS) for solvability.  
- Variants: Fixed Targets, Multiple Player, Push&Pull, Boxoban.  
- Rendering modes including tiny_rgb_array.

**3. Important data, statistics, quotes**  
- Room sizes from 7×7 (2 boxes) to 13×13 (5 boxes).  
- "The possibility of making irreversible mistakes makes these puzzles so challenging especially for Reinforcement Learning algorithms."  
- 410 stars on GitHub.

**4. Conclusions**  
A flexible, research-ready Sokoban Gym wrapper supporting RL experimentation.

## Merge. Split. Move Forward.
**URL:** https://www.reddit.com/r/sokoban/comments/1ushlkz/merge_split_move_forward/

**1. Main topic and thesis**  
Announcement of "Soulban 2048," a minimalist Sokoban-inspired puzzle game emphasizing merging, splitting, and forward planning.

**2. Key points and arguments**  
- Steam page live; demo upcoming.  
- Focus on core mechanics of merge/split within a Sokoban-like framework.

**3. Important data, statistics, quotes**  
- Post from July 2026.

**4. Conclusions**  
Innovative variant expanding Sokoban with merge/split dynamics.

## Summary
These sources collectively cover Sokoban from custom mechanics (multi-tile/recursive pushing, merge/split) and implementation details (collision, pushing in GameMaker) to AI/research tools (Gym environment with RL rewards and procedural generation). Common themes include the challenges of irreversible moves, the value of simulation/undo systems, and tile-based collision handling. The ecosystem supports both game development and algorithmic solving.

## Sources
- https://ken.garstin.ca/2023/08/07/sokoban-type-game/  
- https://timallanwheeler.com/blog/2022/01/19/basic-search-algorithms-on-sokoban/  
- https://gamedev.stackexchange.com/questions/178376/collision-with-walls-in-a-completely-tile-based-game  
- https://www.reddit.com/r/gamemaker/comments/tzyzr9/sokoban_pushing_objects/  
- https://github.com/mpschrader/gym-sokoban  
- https://www.reddit.com/r/sokoban/comments/1ushlkz/merge_split_move_forward/