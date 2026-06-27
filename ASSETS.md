# Creature assets — generation & drop-in guide

The game renders **animated procedural blobs** by default. To upgrade a creature to a real
3D model, generate a `.glb`, drop it in `public/models/`, and register it. Any creature
without a model keeps the procedural fallback — so you can do this **one creature at a time**.

## Pipeline (how it fits together)

```
public/models/agumon.glb   ← you drop the file here
        │
src/three/models.ts        ← register:  agumon: "/models/agumon.glb"
        │
src/three/CreatureModel.tsx ← loads it, normalizes height, plays "Idle" clip
        │
src/three/Creature.tsx     ← uses the model if registered, else ProceduralCreature
```

## Step by step

1. **Generate** a model with an AI tool (recommended):
   - **[Tripo](https://www.tripo3d.ai/)** — fastest iteration (~8s), great for trying many.
   - **[Meshy](https://www.meshy.ai/)** — has **auto-rigging + animation**, best when you want
     an `Idle`/`Attack` clip baked in.
   - Use **image-to-3D** for the most control: make/collect a front + side reference first,
     then generate from it (much more consistent than text-only).
2. **Export** as **`.glb`** (binary glTF) with:
   - **Y-up**, real-world-ish scale (the loader re-normalizes height anyway).
   - **Embedded textures** (PBR), triangles **< ~30k** for a smooth board of ~10 units.
   - If animated, name the loop clip **`Idle`** (the loader looks for it, else plays clip 0).
3. **Drop** the file into `public/models/` (e.g. `public/models/agumon.glb`).
4. **Register** it in `src/three/models.ts`:
   ```ts
   export const MODEL_PATHS = {
     agumon: "/models/agumon.glb",
   };
   ```
5. Save — it appears on the board immediately (Vite HMR). Tune `TARGET_HEIGHT` in `models.ts`
   if everything looks too big/small; flip the `facing` rotation in `CreatureModel.tsx` if
   models face away from the camera.

> **Keep one art direction across all 12** (same render style, proportions, outline) or the
> roster will look like a grab-bag. Generate them in one session with the same style prompt.

## Style prefix (prepend to every prompt)

```
Stylized chibi monster, cute, game-ready low-poly, clean quad-ish topology,
PBR textures, vibrant saturated colors, full body, symmetric T-pose,
neutral plain background, single character, soft studio lighting
```

## Per-creature prompts

Color cue = the creature's attribute tint in-game (Vaccine = green, Data = blue, Virus = purple).

| Creature | Attribute | Prompt subject (append to the style prefix) |
|---|---|---|
| **Agumon** | Vaccine | small orange bipedal baby dinosaur, big head, stubby clawed arms, friendly fangs |
| **Gabumon** | Data | small reptile wearing a blue-and-white horned fur pelt over its body, single horn |
| **DemiDevimon** | Virus | small round purple bat-imp, big leathery wings, one big eye, tiny fangs |
| **Patamon** | Vaccine | small round orange hamster-like creature with large bat-wing ears, tiny |
| **Tentomon** | Data | red beetle/ladybug humanoid, hard shell, four small arms, big round eyes |
| **Betamon** | Virus | green amphibian frog-lizard, smooth skin, dorsal fin, webbed feet |
| **Bakemon** | Virus | white cartoon ghost under a tattered sheet, fanged grin, floating |
| **Biyomon** | Vaccine | small pink baby bird chick, big eyes, stubby wings, a single head feather |
| **Palmon** | Data | walking green plant creature, body of a stalk, a pink flower bloom on its head |
| **Gomamon** | Vaccine | white baby seal pup with purple stripe markings, big flippers, cheerful |
| **Hawkmon** | Vaccine | small brown falcon, sharp eyes, a single tall red feather on its head |
| **Guilmon** | Virus | red dragon-dinosaur hatchling, black hazard markings, small wings, fierce |

## Pose & animation matter a lot

A model with **no animation clip sits in its rest pose** — and many ripped/free models
(e.g. the Sketchfab "Digimon Links Agumon") rest in a **T-pose** with arms straight out,
which looks stiff and sprawls wide on the board. The loader still shows it (with a subtle
idle bob), but for a good look prefer:

- Models that **ship with an `Idle` clip** (best), or
- **A-pose / relaxed-pose** static models (arms down — far less awkward than a T-pose), or
- Auto-rig + animate in **Meshy**, or rig in **[Mixamo](https://www.mixamo.com/)** and export
  the loop clip named `Idle`.

The loader width-clamps very wide poses so they still fit the grid, but it can't un-T-pose a
model — that needs animation/rigging.

### Animation clip names the loader uses

`CreatureModel.tsx` drives a state machine from combat. It matches clip names
case-insensitively, so name your clips (or pick models with clips named) like:

- **idle** — looped standing pose (also used as the resting state)
- **move** (or `walk` / `run`) — played while a unit walks toward its target
- **attack01** (or `attack` / `attack02`) — one-shot, fired the instant a hit lands

Extra clips (damage, win, etc.) are ignored for now but can be wired up later. The
ripped-game Agumon already happens to use exactly these names.

## Generating without Tripo/Meshy

If you only have an image generator, make 4-view turnaround sheets and feed them to an
image-to-3D tool. Avoid uploading anything you don't have rights to; for a public release,
swap the Digimon names/looks for original monster designs (see the IP note in the README).
