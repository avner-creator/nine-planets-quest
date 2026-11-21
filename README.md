# Nine Planets Quest

A 3D adventure game that runs in your web browser.

## ▶ Play: https://avner-creator.github.io/nine-planets-quest/

Travel through 9 portals to 9 worlds, beat the temple guardians to win power crystals, find the key in each world to open the next portal, upgrade your sword from wood all the way to diamond, and sleep at night before the night creatures find you.

- **3 modes:** Creative (fly, build, can't get hurt), Quest (earn every power), Hero (all powers, beat the bosses)
- **9 heroes**, each with their own element: Life, Healing, Fire, Ice, Earth, Lightning, Light, Darkness and Death
- **9 moves for every element** (81 in all), with a SUPER for each
- **1 or 2 players** on one keyboard (split screen)

## Keys

| | Player 1 | Player 2 |
|---|---|---|
| Walk / turn | W A S D (arrow keys too when playing alone) | Arrow keys |
| Jump | Space | L |
| Sword | F (or left click) | J or Enter |
| Power (hold for SUPER) | G (or right click) | K |
| Next move / next element | R / T | I / O |
| Use / talk / sleep / key | E | U |
| Pick a hero | Q | P |
| First person / third person | V (or scroll the mouse wheel in) | ; |

**M** map · **Esc** pause · **Alt + F5** show all the keys

Works best in Chrome or Edge on a computer with a keyboard. Your progress is saved in your browser.

## Run it on your own computer

Serve this folder with any static web server (on Windows: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Open`) and open http://localhost:5174/.

Made with [three.js](https://threejs.org/) (MIT licence, in `vendor/three`). Everything else (worlds, characters, sounds) is generated in code.
