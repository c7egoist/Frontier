# Frontier

## Level greyboxes

- **[Scene 04 / Iron Tide — working scrapyard](Frontier/Projects/Project-Deadwood/SCRAPYARD.md):** the new default. A 1.9 km branching yard of stacked/crushed cars, metal shacks and tyre heaps. Working crane magnets physically pull and lift scrap and the player car; cranes dump loads or collapse with them; hovering cargo drones drop physical obstacles ahead. Includes a dedicated glTF/layout and live inspection demonstrations.

- **[Scene 03 / Icebound — glacier cave](Frontier/Projects/Project-Deadwood/GLACIER.md):** retained Scene 3. A 2 km point-to-point run across randomized snow grip islands, pressure-ridge channels and open-water leads, through glacier caves and a frozen sailing fleet. Large random crystal showers, branching polygon fractures, timed collapse, avalanche-opened shortcuts and a same-map exit portal. No continuous snow trail. Includes standalone glTF/layout interchange.
- **[The Hunger — carnivorous garden](Frontier/Projects/Project-Deadwood/GARDEN.md):** an organic maze with enclosed living tunnels, wavy ground, physical stones, fast buried flytrap ambushes and explosive firefly swarms that damage the vehicle. Retained older study, reached through the forest portal; its exit now leads into Icebound. Includes its own garden-only glTF scene.
- **[Deadwood — dead forest](Frontier/Projects/Project-Deadwood/README.md):** a 2.2 km point-to-point driving greybox with branching, continuously growing roots, rocks/sand/dust, inspection tools and a same-scene portal into The Hunger. Use the header tabs or `?scene=forest`.

All four are local browser prototypes plus glTF interchange, not yet integrated into the native networking client. They coexist in one loaded scene; portals transfer the vehicle without loading another level.

Run from `Frontier/Projects/Project-Deadwood` with `npm ci && npm run dev`.
