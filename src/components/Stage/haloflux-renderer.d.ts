export interface HaloFluxState {
  reach?:number;
  flow?:number;
	spider?: boolean;
	nebula?: boolean;
	packets?: {n:number;verb:string;text:string}[];
  paused: boolean;
  speed: number;
  camera: boolean;
  reducedMotion: boolean;
  velocity: number;
  events: number;
  labels: string[];
}
export function createHaloFluxRenderer(canvas: HTMLCanvasElement): {
  update(state: HaloFluxState): void;
  destroy(): void;
};
