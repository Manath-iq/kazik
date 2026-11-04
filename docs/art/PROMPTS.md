# Промпты генерации STREET LEGENDS

Перед каждым промптом приложить общий стиль ниже. Генерировать по одной задаче, не весь набор одним изображением. Промпты англоязычные для точности; интерфейс игры будет русским, но **изображения без текста**.

## Общий префикс

```text
Create original production game art for STREET LEGENDS, an independent portrait 2D nighttime street-survival arcade. This is a new IP. Do not imitate or reproduce characters, branding, screenshots or recognizable assets from existing games.

Art direction: handcrafted crisp pixel art, chunky intentional pixel clusters, restrained 16-bit arcade readability, limited cold midnight palette. Dominant colors #080B10 #0E131B #141B25 #1B2532 #344154, highlights #E7EDF5 and #96A6B8. Lime #C5F542 identifies the player; cyan #30C6FF is experience; yellow #FFCA3A is loot; coral #FF6575 signals enemies; violet #8B78FF is reserved for casino accents. Consistent light from upper left. Minimal 2–3 tone shading per material. No photorealism, no 3D render, no smooth painting, no blur, no anti-aliased vector look, no brown/sandy/earthy dominant palette, no excessive neon bloom. No words, numbers, letters, logos, watermark, UI panels or frame labels.
```

## P01 — лобби: ночной район

**Источник:** `art/source/P01-lobby-v01.png` → **runtime:** `lobby-night.png`.

```text
Create a portrait 3:4 pixel-art environment illustration, composed for a mobile game lobby. A fictional quiet urban neighborhood after midnight: a narrow cold asphalt street recedes between low apartment buildings and a small shuttered corner shop, broken white road markings, sidewalk curb, a wire fence, a metal bin, two pools of warm-yellow streetlamp light, restrained violet light from a small unlettered shop sign. Cold blue-gray building silhouettes, a few tiny lit windows, subtle pixel clusters suggesting damp reflections, not shiny glass. A slightly elevated street-level view, not a flat map and not isometric. Rich layered environmental detail with a clearly readable focal street. Keep the top 18% and bottom 18% visually calm for text to be overlaid later by the app, but draw the entire scene; do not draw any UI. No characters, no text, no logos, no cars with real-world branding. The image should look appealing and intentional at 480×640. Full-bleed opaque background. Use exact 3:4 aspect ratio if supported; otherwise generate the closest portrait composition and leave safe crop margins.
```

## P02 — герой

**Источник:** `art/source/P02-player-v01.png` → **runtime:** `player.png`.

```text
Create an animation sprite sheet of ONE original adult street-runner protagonist. Short dark hair, charcoal cropped jacket with unmistakable lime #C5F542 shoulder inserts, dark trousers, pale sneakers, a tiny fictional arcade pistol in the right hand, no branding. Readable confident silhouette, not military, not a superhero. Top-down three-quarter game camera: see the top of the head and shoulders, a little face, facing diagonally right/down; NOT isometric.

Eight poses, exactly 4 columns × 2 rows of equal square cells, read left-to-right top-to-bottom: idle A, idle B (subtle breath), run A (left foot forward), run B (passing pose), run C (right foot forward), run D (passing pose), hit reaction (no flash), downed on the ground (non-graphic). Every pose is the exact same person, outfit, proportions, lighting, camera and pixel density. Fixed grounded pivot and consistent body size. One complete figure per cell, generous transparent padding, no overlap and no cropping. No cast shadows, no floor, no background, no grid, no annotations or labels. Genuine transparent background if supported. Wide 2:1 canvas. It will be normalized to eight 48×48 frames, so use large readable clusters rather than tiny decorative detail.
```

Если сетка не получилась, генерировать 8 отдельных квадратных изображений, меняя только предложение с позой. Сохранить их в `art/source/P02-player-frames/` и собрать лист скриптом.

## P03 — гопник

**Источник:** `art/source/P03-thug-v01.png` → **runtime:** `enemy-thug.png`.

Использовать промпт P02, заменив описание героя на:

```text
ONE original adult stocky street thug enemy: navy-blue tracksuit with pale side stripes, muted coral-red knitted beanie, dark shoes, fists visible, no gun. Slightly hunched broad stance, not monstrous, no gore. Enemy accents coral, absolutely no lime player markings. Same top-down camera, pixel scale and lighting as the supplied original player sprite.
```

Сохранить те же 8 поз, сетку 4×2 и прозрачный фон.

## P04 — бегун

**Источник:** `art/source/P04-runner-v01.png` → **runtime:** `enemy-runner.png`.

P02 с заменой персонажа:

```text
ONE original adult lean fast street enemy: charcoal hoodie with muted violet sleeves, dark slim trousers, light sneakers, no weapon. Narrow athletic silhouette and a visibly longer running stride. Small coral detail identifies danger; no lime. Same top-down camera, body height, pixel density and light as the original player. Face is barely visible under the hood, not a skull or mask from an existing game.
```

## P05 — качок

**Источник:** `art/source/P05-brute-v01.png` → **runtime:** `enemy-brute.png`.

P02 с заменой персонажа:

```text
ONE original adult heavy bruiser enemy: broad muscular shoulders, cool gray sleeveless shirt, charcoal heavy trousers and boots, coral cloth wraps on both fists, shaved head. Wide powerful readable silhouette, slower heavy running poses, no weapon and no gore. Fit the same 48×48 cell contract with a wider body, not a taller camera scale. Same top-down camera and lighting as the original player.
```

## P06 — босс «Авторитет»

**Источник:** `art/source/P06-boss-v01.png` → **runtime:** `boss.png`.

P02 с заменой персонажа и целевого кадра:

```text
ONE original imposing adult street boss: silver-gray hair, broad shoulders, long midnight coat with dark burgundy lining, gray shirt, heavy boots, clenched hands. No crown, armor, fantasy ornament, real-person likeness, logo or gun. Quiet threatening posture, readable coat movement during a heavy run, a strong leaning hit reaction, non-graphic downed pose. About 35% larger than ordinary enemies. Same top-down camera and lighting as the original player. Eight poses in the same 4×2 layout, but target frame size is 64×64. Keep the coat silhouette fully inside each cell with padding.
```

## P07 — бесшовные поверхности

Три **отдельные** генерации, не одна таблица.

### P07a → `tile-asphalt.png`
```text
Create one seamless square top-down pixel-art asphalt ground texture for a nighttime urban arcade. Nearly black blue-gray asphalt, sparse deliberate cool-gray grain clusters, a few tiny subtle cracks. Flat orthographic top view, absolutely no perspective, objects, curbs, puddle highlights, lamps, borders, text or lane markings. Low contrast so enemies and loot remain readable. All four edges must tile seamlessly. Readable at a final size of 32×32 logical pixels. Opaque image, fill the whole square.
```

### P07b → `tile-sidewalk.png`
```text
Create one seamless square top-down pixel-art sidewalk tile texture. Cold slate-blue square concrete paving slabs, subtle dark seams, restrained 2–3 tone shading, low contrast, no brown stone. Flat orthographic camera. No curb edge, plants, objects, text or border around the image. All four edges tile seamlessly. Final logical tile 32×32 pixels. Opaque image filling the square.
```

### P07c → `tile-road-marking.png`
```text
Create a single worn off-white short vertical dashed road marking centered in a square transparent pixel-art tile. Only the paint shape, with a few intentional chipped pixels, no asphalt or shadow. Fits comfortably inside a 32×32 logical pixel tile. Flat orthographic top view, crisp large pixel clusters, no letters or numbers. Genuine transparent background.
```

## P08 — уличные предметы

Генерировать **каждый предмет отдельно**, квадратный/портретный кадр по пропорциям предмета. Общая добавка:

```text
Isolated original game prop, matching the provided original STREET LEGENDS player/environment reference. Slightly elevated top-down three-quarter camera, not isometric, upper-left light. Full object entirely visible with padding. Crisp pixel clusters that survive reduction to the target size. No scene, text, labels, cast shadow, frame or floor. Genuine transparent background.
```

| Промпт предмета | Runtime |
|---|---|
| `A slender cool-gray urban streetlamp, small yellow light head, narrow pole, readable base, portrait silhouette. Target 48×64.` | `prop-lamp.png` |
| `A dented blue-gray metal street rubbish bin with a lid, no lettering or symbols. Target 32×32.` | `prop-bin.png` |
| `One horizontal modular section of dark blue-gray wire fence, thin posts, repeatable left/right edges, no ground. Target 64×32.` | `prop-fence.png` |
| `A fictional unbranded old compact sedan, dark slate body, pale windshield, rear red lamps, oriented vertically with front upward, elevated top-down view. Target 48×80.` | `prop-car.png` |
| `A small rectangular wall-mounted violet and cyan abstract neon shop sign, geometric luminous bars only, absolutely no letters or pseudo-text, restrained light. Target 64×48.` | `prop-neon.png` |

## P09 — добыча

Три отдельных изображения, прозрачный фон, итог 16×16. Не использовать стандартные emoji.

```text
Create one original tiny pixel-art pickup icon for a dark top-down arcade. Transparent background, centered, no shadow or scene, upper-left light, bold silhouette, just 2–3 tones, designed to read at 16×16 actual pixels. No text, labels, logos or extra objects.
```

- **Money:** `A compact folded bundle of fictional yellow-gold game banknotes with one pale band, no currency symbol.` → `pickup-money.png`.
- **XP:** `One bright cyan diamond-shaped experience crystal, small off-white highlight, no surrounding aura.` → `pickup-xp.png`.
- **Medkit:** `A small pale blue-gray first-aid box with a coral cross-shaped game marking, no lettering.` → `pickup-medkit.png`.

## P10 — четыре иконки навигации

Генерировать отдельно, не UI-макет. Итог 24×24, alpha.

```text
Create one original crisp pixel-art mobile game navigation icon, transparent background, no enclosing button or frame, no text. Bold compact silhouette, 1 logical pixel contour, restrained 3-tone palette #96A6B8 #E7EDF5 with a tiny #C5F542 accent. Designed for 24×24 logical pixels and consistent with a dark nighttime street arcade.
```

- `A dynamic sneaker with two short pixel motion strokes.` → `icon-run.png`.
- `Two overlapping fictional playing cards and one small chip, no suit lettering or numbers.` → `icon-casino.png`.
- `Three simplified adult street-crew silhouettes grouped together, not faces with detail.` → `icon-gang.png`.
- `A compact apartment-block silhouette with three illuminated windows.` → `icon-city.png`.

## P11 — ракета казино

**Источник:** `art/source/P11-rocket-v01.png` → **runtime:** `rocket.png`.

```text
Create one original playful pixel-art arcade rocket for a virtual-currency-only minigame. A short off-white and cool blue-gray body, violet fins, small cyan window, modest yellow-orange pixel exhaust. Rocket points diagonally up-right at 45 degrees. Compact readable silhouette, one upper-left highlight, no excessive glow. Whole rocket and exhaust fully inside a square with padding. Transparent background, no stars, chart, text, numbers, casino table or UI. Designed to read at 64×64 logical pixels. This is a fictional toy-like arcade vehicle, not a realistic weapon or a copy of any existing game's rocket.
```

## После генерации

Не заканчивать на raw-изображениях. Следовать нормализации и проверкам в `ASSET_CONTRACT.md`. Если выполнить конкретный файл не удалось — записать `blocked`/`needs-fix`, а не делать вид, что файл готов.
