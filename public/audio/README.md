# Audio Asset Catalog

This folder contains placeholder `.mp3` files for the runtime audio system (`public/js/audio-system.js`).

## Replacement rules

1. Keep directory structure, file names, and extensions exactly as-is.
2. Replace file content only.
3. Prefer 44.1kHz or 48kHz, mono/stereo, normalized peaks near -1 dBTP.
4. Loop files should have clean loop points (zero-crossing).

## Folder map

- `ui/`: menu and interaction sounds
- `vehicles/player/`: player driving layers
- `gameplay/`: race and objective feedback
- `weapons/mines/`: mine action feedback
- `impacts/`: collision layers
- `explosions/`: explosion tails
- `ambience/`: background loops

## Files

### ui

- `ui/ui_click_soft_01.mp3`
- `ui/ui_click_soft_02.mp3`
- `ui/ui_toggle_on_01.mp3`
- `ui/ui_toggle_off_01.mp3`
- `ui/ui_confirm_01.mp3`

### vehicles/player

- `vehicles/player/engine_idle_loop_01.mp3`
- `vehicles/player/engine_low_loop_01.mp3`
- `vehicles/player/engine_mid_loop_01.mp3`
- `vehicles/player/engine_high_loop_01.mp3`
- `vehicles/player/engine_redline_loop_01.mp3`
- `vehicles/player/wind_speed_loop_01.mp3`
- `vehicles/player/skid_loop_01.mp3`
- `vehicles/player/handbrake_scrape_loop_01.mp3`
- `vehicles/player/suspension_rattle_loop_01.mp3`

### gameplay

- `gameplay/countdown_beep_01.mp3`
- `gameplay/countdown_go_01.mp3`
- `gameplay/pickup_collect_01.mp3`
- `gameplay/pickup_collect_02.mp3`
- `gameplay/charging_start_01.mp3`
- `gameplay/charging_loop_01.mp3`
- `gameplay/charging_stop_01.mp3`
- `gameplay/battery_depleted_01.mp3`
- `gameplay/battery_restored_01.mp3`
- `gameplay/round_finished_01.mp3`
- `gameplay/respawn_01.mp3`

### weapons/mines

- `weapons/mines/mine_deploy_drop_01.mp3`
- `weapons/mines/mine_deploy_throw_01.mp3`
- `weapons/mines/mine_arm_01.mp3`
- `weapons/mines/mine_beep_loop_01.mp3`
- `weapons/mines/mine_detonate_near_01.mp3`
- `weapons/mines/mine_detonate_far_01.mp3`

### impacts

- `impacts/collision_light_01.mp3`
- `impacts/collision_light_02.mp3`
- `impacts/collision_heavy_01.mp3`
- `impacts/obstacle_crash_01.mp3`
- `impacts/obstacle_crash_02.mp3`
- `impacts/debris_scatter_01.mp3`

### explosions

- `explosions/vehicle_explosion_01.mp3`
- `explosions/vehicle_explosion_02.mp3`
- `explosions/fireball_tail_01.mp3`

### ambience

- `ambience/city_ambience_day_loop_01.mp3`
- `ambience/race_crowd_far_loop_01.mp3`
