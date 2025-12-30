export type ElementSyncInput = {
  guid: string;
  revitId: number;
  name: string;
  type: string;
  material: string;
  softwareOriginator?: string;
};

export type ElementUpdateInput = {
  yearAdded?: string;
  softwareOriginator?: string;
  comment?: string;
};

export type ElementRecord = ElementSyncInput & {
  yearAdded: string;
  softwareOriginator: string;
  comment: string;
  createdAt: string;
  updatedAt?: string;
};
