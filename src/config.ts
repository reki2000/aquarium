// World units are meters. Tank sits centered on x/z with its inner bottom at y = 0.

/** Standard Japanese 60cm tank (60 x 30 x 36 cm). */
export const TANK = {
  width: 0.6,
  depth: 0.3,
  height: 0.36,
  glass: 0.006,
  waterLevel: 0.33,
} as const;

export const WATER_BOX = {
  min: [-TANK.width / 2, 0, -TANK.depth / 2] as const,
  max: [TANK.width / 2, TANK.waterLevel, TANK.depth / 2] as const,
};

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  pixelRatio: number;
  shadowMapSize: number;
  ao: boolean;
  dof: boolean;
  bloom: boolean;
  particles: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadowMapSize: 2048, ao: true, dof: true, bloom: true, particles: 1800 },
  medium: { pixelRatio: 1, shadowMapSize: 1024, ao: true, dof: false, bloom: true, particles: 900 },
  low: { pixelRatio: 0.75, shadowMapSize: 512, ao: false, dof: false, bloom: false, particles: 300 },
};

export const SHRIMP_COUNT = 14;
