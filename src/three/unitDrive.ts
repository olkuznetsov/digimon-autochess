/**
 * Per-unit animation "remote control": a mutable object the owner (prep Creature
 * or battle BattleUnit) updates every frame, read by CreatureModel/Creature in
 * their own useFrame. Keeps 60 Hz animation state out of React renders.
 *
 * *Key counters are bumped to signal one-shot events (attack landed, ultimate cast,
 * got hit, …); readers compare against the last value they saw.
 */
export interface UnitDrive {
  /** world position the unit should stand at (smoothed by the renderer) */
  x: number;
  z: number;
  /** yaw the unit should face (radians, 0 = +z) */
  yaw: number;
  moving: boolean;
  /** seconds until the next attack (battle) and the attack interval — for swing anticipation */
  cooldown: number;
  attackInterval: number;
  /** stationary next to a live target, so an attack is coming */
  engaged: boolean;
  attackKey: number;
  castKey: number;
  hitKey: number;
  heavyHitKey: number;
  /** frozen by an ultimate */
  stunned: boolean;
  /** set on fire (Fire's top tier) */
  burning: boolean;
  dead: boolean;
  win: boolean;
  /** bump to play a materialize-in (battle start, digivolution) */
  spawnKey: number;
  /** 0..1 hp for the label (battle) */
  hpFrac: number;
  manaFrac: number;
  shieldFrac: number;
}

export function newDrive(x = 0, z = 0, yaw = 0): UnitDrive {
  return {
    x,
    z,
    yaw,
    moving: false,
    cooldown: 0,
    attackInterval: 1,
    engaged: false,
    attackKey: 0,
    castKey: 0,
    hitKey: 0,
    heavyHitKey: 0,
    stunned: false,
    burning: false,
    dead: false,
    win: false,
    spawnKey: 0,
    hpFrac: 1,
    manaFrac: 0,
    shieldFrac: 0,
  };
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
