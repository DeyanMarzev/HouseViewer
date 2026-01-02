export type ItemPosition = { x: number; y: number; z: number };

export function parseRoomsValue(value: unknown): string[];
export function parsePositionValue(value: unknown): ItemPosition;
export function normalizeRoomsInput(value: unknown): string[] | undefined | null;
export function normalizePositionInput(value: unknown): ItemPosition | undefined | null;
