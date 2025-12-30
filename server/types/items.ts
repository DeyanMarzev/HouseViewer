export type ItemInput = {
  name: string;
  description?: string;
  url?: string;
  dateAdded?: string;
  rooms: string[];
  position: { x: number; y: number; z: number };
};

export type ItemRecord = ItemInput & { id: string; createdAt: string; updatedAt?: string };
