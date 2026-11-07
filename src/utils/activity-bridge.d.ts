export function createSnapshotGate(): (snapshot: object | null | undefined) => boolean;
export function subscribeRuntime(runtime: any, event: string, handler: (...args: any[]) => void): () => void;
