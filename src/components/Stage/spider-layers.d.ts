interface LayerState {
  reach?: number;
  flow?: number;
  spider: boolean;
  nebula: boolean;
  packets: { n: number; verb: string; text: string }[];
}
interface LayerFrame {
  cx: number; cy: number; radius: number; width: number; height: number;
  time: number; dt: number; mouseX: number; mouseY: number;
  reducedMotion: boolean; light?: boolean;
}
export function createSpiderLayers(): {
  update(state: LayerState): void;
  draw(context: CanvasRenderingContext2D, frame: LayerFrame): void;
  destroy(): void;
};
