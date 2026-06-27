# public/models

Drop AI-generated creature models here as `.glb` files named by creature id, e.g.:

```
public/models/agumon.glb
public/models/gabumon.glb
```

Then register each one in `src/three/models.ts`:

```ts
export const MODEL_PATHS = {
  agumon: "/models/agumon.glb",
};
```

Creatures without a registered model render the animated procedural fallback.
See `ASSETS.md` in the project root for generation prompts and export settings.
