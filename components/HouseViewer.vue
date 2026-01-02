<script setup lang="ts">
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { ElementRecord, ElementSyncInput, ElementUpdateInput } from '~/server/types/elements';
import type { ItemRecord } from '~/server/types/items';

type ItemFormState = {
  name: string;
  description: string;
  url: string;
  dateAdded: string;
  rooms: string;
  position: { x: number; y: number; z: number };
};

type EditItemState = ItemFormState & { id: string };

type ElementMetaFormState = {
  yearAdded: string;
  softwareOriginator: string;
  comment: string;
};

const container = ref<HTMLDivElement | null>(null);
const canvasWrap = ref<HTMLDivElement | null>(null);
const overlay = ref<HTMLDivElement | null>(null);
const markerLayer = ref<HTMLDivElement | null>(null);
const { token, user } = useAuth();
const runtimeConfig = useRuntimeConfig();
const editorEmail = 'marzev@gmail.com';
const isEditor = computed(() =>
  user.value?.email?.toLowerCase() === editorEmail.toLowerCase()
);
const appTheme = useState<'dark' | 'light'>('theme', () => 'dark');
const elementsTableWrap = ref<HTMLDivElement | null>(null);
type ViewerMode = 'view' | 'edit' | 'sensors';

const mode = ref<ViewerMode>('view');
const selectedFloor = ref<'all' | 'ground' | 'first' | 'second'>('all');
const selectedItemId = ref<string | null>(null);
const loadingModel = ref(true);
const modelError = ref('');
const itemsLoading = ref(false);
const itemsError = ref('');
const mutationLoading = ref(false);
const mutationError = ref('');
const elementsLoading = ref(false);
const elementsError = ref('');
const elementMutationLoading = ref(false);
const elementMutationError = ref('');
const items = ref<ItemRecord[]>([]);
const elementRecords = reactive(new Map<string, ElementRecord>());
const itemMeshes = new Map<string, THREE.Mesh>();
const authHeaders = computed<Record<string, string> | undefined>(() =>
  token.value ? { Authorization: `Bearer ${token.value}` } : undefined
);

const createBlankPosition = () => ({ x: 0, y: 0, z: 0 });
const createEmptyForm = (): ItemFormState => ({
  name: '',
  description: '',
  url: '',
  dateAdded: '',
  rooms: '',
  position: createBlankPosition()
});
const createEmptyElementMeta = (): ElementMetaFormState => ({
  yearAdded: '',
  softwareOriginator: '',
  comment: ''
});

const newItem = reactive<ItemFormState>(createEmptyForm());
const elementMetaForm = reactive<ElementMetaFormState>(createEmptyElementMeta());

type FloorKey = 'all' | 'ground' | 'first' | 'second';
type FloorHeights = Record<FloorKey, { minY?: number; maxY?: number }>;

const floorHeights: FloorHeights = {
  all: {},
  ground: {},
  first: {},
  second: {}
};

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let labelRenderer: CSS2DRenderer | null = null;
let esp32PollTimer: number | null = null;
let esp32FetchInFlight = false;
let weatherPollTimer: number | null = null;
let weatherFetchInFlight = false;
let controls: OrbitControls;
let hemiLight: THREE.HemisphereLight | null = null;
let ambientLight: THREE.AmbientLight | null = null;
let dirLight: THREE.DirectionalLight | null = null;
let clipPlanes: THREE.Plane[] = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let modelCenter = new THREE.Vector3();
let modelSize = new THREE.Vector3();
let modelMaxDim = 1;
let modelHeight = 1;
let defaultCameraOffset = new THREE.Vector3(6, 5, 8);
let modelBaseY = 0;
let modelRoot: THREE.Object3D | null = null;
let modelBounds = new THREE.Box3();
const clipHelpers: THREE.PlaneHelper[] = [];

const computeItemSize = () => 10;
const DEFAULT_FLOOR_HEIGHT = 6;
const sensorPlaneColors = [0x38bdf8, 0x34d399, 0x818cf8];

const layoutRef = ref<HTMLDivElement | null>(null);
const leftPanelWidth = ref(280);
const rightPanelWidth = ref(280);
const dragSide = ref<'left' | 'right' | null>(null);
type RightPanelTab = 'models' | 'selection';
const rightPanelTab = ref<RightPanelTab>('models');

const sensorPlanes: THREE.Plane[] = [];
const sensorPlaneMeshes: THREE.Mesh[] = [];
const sensorHitMeshes: THREE.Mesh[] = [];
let sensorBoxHelper: THREE.Box3Helper | null = null;
const sensorClippedMaterials = new Set<THREE.Material>();
const sensorBoxVisible = ref(true);
let sensorBoxSize = new THREE.Vector3();
let sensorBoxMin = new THREE.Vector3();
let sensorBoxMax = new THREE.Vector3();
let sensorBoxInitialized = false;
let sensorDraggingIndex: number | null = null;
let sensorActiveIndex: number | null = null;
let sensorDragViewPlane: THREE.Plane | null = null;
let sensorDragStartPoint: THREE.Vector3 | null = null;
let sensorDragStartMin: THREE.Vector3 | null = null;
let sensorDragStartMax: THREE.Vector3 | null = null;
let animationId: number | null = null;
const sensorStencilGroups: { parent: THREE.Object3D; group: THREE.Group }[] = [];
const sensorCapMeshes: THREE.Mesh[] = [];
const clipStencilGroups: { parent: THREE.Object3D; group: THREE.Group }[] = [];
const clipCapMeshes: THREE.Mesh[] = [];
const capColorMode = ref<'gray' | 'match'>('gray');
const debugClipping = ref(false);
const canvasBackground = ref<'dark' | 'light'>('dark');
const showCanvasSettings = ref(false);
const showElementsTable = ref(false);
const elementsPopupOpen = ref(false);
const elementsPanelTab = ref<'elements' | 'materials'>('elements');
const elementTableSearch = ref('');
const lightSettings = reactive({
  hemi: {
    intensity: 0.9,
    color: '#ffffff',
    groundColor: '#1f2937'
  },
  ambient: {
    intensity: 0.2,
    color: '#ffffff'
  },
  directional: {
    intensity: 1.05,
    color: '#ffffff'
  }
});
const clipDebugInfo = ref<{ planes: { normal: THREE.Vector3; constant: number }[]; caps: number }>({
  planes: [],
  caps: 0
});
let elementsPopup: Window | null = null;
const themeVarNames = [
  '--bg-page',
  '--panel-bg',
  '--panel-bg-alt',
  '--panel-bg-strong',
  '--panel-bg-glass-strong',
  '--panel-bg-hover',
  '--border',
  '--border-soft',
  '--text-primary',
  '--text-muted',
  '--text-soft',
  '--text-inverse',
  '--accent-gradient',
  '--accent-strong',
  '--accent-shadow',
  '--shadow-context',
  '--elements-selected-bg',
  '--elements-selected-text'
];

type ModelLayerConfig = {
  id: string;
  label: string;
  matches: string[];
};

const modelLayers: ModelLayerConfig[] = [
  { id: 'structure', label: 'Structure', matches: ['structure'] },
  { id: 'finishes', label: 'Finishes', matches: ['finish', 'finishes'] },
  { id: 'plumbing', label: 'Plumbing', matches: ['plumbing'] },
  { id: 'sensors', label: 'Sensors', matches: ['sensor', 'sensors'] },
  { id: 'landscape', label: 'Landscape', matches: ['landscape'] },
  { id: 'adjacent', label: 'Adjacent Buildings', matches: ['adjacent', 'building', 'buildings'] }
];

const modelVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(
    modelLayers.map((layer) => [layer.id, !['landscape', 'adjacent'].includes(layer.id)])
  )
);
const modelLayerObjects = new Map<string, THREE.Object3D[]>();
const getModelLayerLabel = (layerId?: string | null) => {
  if (!layerId) return '-';
  const match = modelLayers.find((layer) => layer.id === layerId);
  return match?.label ?? layerId;
};

type MaterialColor = {
  Red: number;
  Green: number;
  Blue: number;
};

type StructureMaterial = {
  Id?: number;
  UniqueId?: string;
  Name: string;
  Color?: MaterialColor;
  Transparency?: number;
};

type StructureElement = {
  Id: number;
  UniqueId?: string;
  Category?: string;
  FamilyName?: string;
  TypeName?: string;
  SoftwareOriginator?: string;
  ModelLayer?: string;
  Material?: string;
  Materials?: string[];
  MaterialInfo?: StructureMaterial | null;
  Geometry?: {
    Vertices: number[];
    Indices: number[];
    TriangleMaterialNames?: string[];
  };
};

const structureMaterials = new Map<string, StructureMaterial>();
const materialCatalog = ref<StructureMaterial[]>([]);
const materialSearch = ref('');
const structureElements = new Map<string, StructureElement>();
const structureElementList = ref<StructureElement[]>([]);
const structureMeshes = new Map<string, THREE.Mesh>();
const structureMeshList: THREE.Mesh[] = [];
const selectedStructureId = ref<string | null>(null);
let selectedStructureMesh: THREE.Mesh | null = null;
const hiddenStructureIds = new Set<string>();
const isolatedStructureId = ref<string | null>(null);
const contextMenuOpen = ref(false);
const contextMenuPos = reactive({ x: 0, y: 0 });
const elementsContextMenuOpen = ref(false);
const elementsContextMenuPos = reactive({ x: 0, y: 0 });
const elementsContextMenuTarget = ref<string | null>(null);
const selectedStructureIds = reactive(new Set<string>());
const getElementKey = (element: StructureElement) =>
  element.UniqueId ? String(element.UniqueId) : String(element.Id);
const selectedStructure = computed(() =>
  selectedStructureId.value ? structureElements.get(selectedStructureId.value) ?? null : null
);
const selectedElementRecord = computed(() =>
  selectedStructureId.value ? elementRecords.get(selectedStructureId.value) ?? null : null
);
const getElementRecordForElement = (element: StructureElement) =>
  elementRecords.get(getElementKey(element)) ?? null;
const highlightedStructureMeshes = new Set<THREE.Mesh>();
const getElementSimilarityKey = (element: StructureElement) => {
  const category = (element.Category || '').trim().toLowerCase();
  const typeName = (element.TypeName || '').trim().toLowerCase();
  const materials = getElementMaterialNames(element).map(normalizeMaterialName).sort().join('|');
  return `${category}|${typeName}|${materials}`;
};
const elementDrafts = reactive<Record<string, ElementMetaFormState>>({});
const ensureElementDraftByKey = (key: string, record?: ElementRecord | null) => {
  if (!key) return null;
  if (!elementDrafts[key]) {
    elementDrafts[key] = {
      yearAdded: record?.yearAdded || '',
      softwareOriginator: record?.softwareOriginator || '',
      comment: record?.comment || ''
    };
  }
  return elementDrafts[key];
};
const getElementDraftForElement = (element: StructureElement) =>
  ensureElementDraftByKey(getElementKey(element), getElementRecordForElement(element));
const getSelectionKeysForUpdate = (key: string) => {
  if (!isEditor.value) return [key];
  if (selectedStructureIds.size > 1 && selectedStructureIds.has(key)) {
    return Array.from(selectedStructureIds);
  }
  return [key];
};
const updateElementDraft = (
  element: StructureElement,
  field: keyof ElementMetaFormState,
  value: string
) => {
  const key = getElementKey(element);
  const keys = getSelectionKeysForUpdate(key);
  keys.forEach((selectedKey) => {
    const selectedElement = structureElements.get(selectedKey);
    if (!selectedElement) return;
    const draft = ensureElementDraftByKey(
      selectedKey,
      getElementRecordForElement(selectedElement)
    );
    if (!draft) return;
    draft[field] = value;
  });
};
const saveElementDraft = async (element: StructureElement) => {
  if (!isEditor.value) return;
  const key = getElementKey(element);
  const keys = getSelectionKeysForUpdate(key);
  await Promise.all(keys.map((selectedKey) => saveElementDraftByKey(selectedKey)));
  renderElementsPopup();
};
const saveElementDraftByKey = async (key: string) => {
  if (!key) return;
  const record = elementRecords.get(key);
  if (!record) return;
  const draft = ensureElementDraftByKey(key, record);
  if (!draft) return;
  const payload: ElementUpdateInput = {};
  const yearAdded = draft.yearAdded.trim();
  const softwareOriginator = draft.softwareOriginator.trim();
  const comment = draft.comment.trim();
  if (yearAdded !== (record.yearAdded || '')) payload.yearAdded = yearAdded;
  if (softwareOriginator !== (record.softwareOriginator || '')) {
    payload.softwareOriginator = softwareOriginator;
  }
  if (comment !== (record.comment || '')) payload.comment = comment;
  if (!Object.keys(payload).length) return;
  try {
    const res = await $fetch<{ element: ElementRecord }>(`/api/elements/${key}`, {
      method: 'PUT',
      body: payload,
      headers: authHeaders.value
    });
    elementRecords.set(res.element.guid, res.element);
    ensureElementDraftByKey(res.element.guid, res.element);
  } catch (err) {
    console.error(err);
  }
};
const refreshStructureElementList = () => {
  structureElementList.value = Array.from(structureElements.values());
};

const getElementSearchText = (element: StructureElement) => {
  const parts = [
    element.Id,
    element.UniqueId,
    element.Category,
    element.FamilyName,
    element.TypeName,
    element.SoftwareOriginator,
    element.ModelLayer,
    getModelLayerLabel(element.ModelLayer),
    element.Material,
    ...(element.Materials ?? [])
  ];
  return parts
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join(' ');
};

const filteredStructureElements = computed(() => {
  const query = elementTableSearch.value.trim().toLowerCase();
  const list = structureElementList.value;
  if (!query) return list;
  return list.filter((element) => getElementSearchText(element).includes(query));
});
const isElementsPanelOpen = computed(
  () => showElementsTable.value || elementsPopupOpen.value
);

type MaterialPreview = {
  name: string;
  swatch: string | null;
  transparency: number | null;
  matched: boolean;
  primary: boolean;
};

const normalizeMaterialName = (name?: string | null) => name?.trim().toLowerCase() ?? '';
const isMaterialNameValid = (name?: string | null): name is string => {
  const normalized = normalizeMaterialName(name);
  return !!normalized && normalized !== 'no material';
};
const getElementMaterialNames = (element?: StructureElement | null) => {
  if (!element) return [];
  const names = Array.isArray(element.Materials) && element.Materials.length
    ? element.Materials
    : element.Material
      ? [element.Material]
      : [];
  const unique = new Set<string>();
  const filtered: string[] = [];
  names.forEach((name) => {
    if (!isMaterialNameValid(name)) return;
    const trimmed = name.trim();
    const key = normalizeMaterialName(trimmed);
    if (unique.has(key)) return;
    unique.add(key);
    filtered.push(trimmed);
  });
  return filtered;
};
const getPrimaryMaterialName = (element?: StructureElement | null) => {
  const names = getElementMaterialNames(element);
  if (!names.length) return null;
  if (names.length > 1) {
    const matched = names.find((name) => !!getMaterialByName(name));
    return matched ?? names[0];
  }
  return names[0];
};
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const getMaterialOpacity = (transparency?: number) => {
  if (typeof transparency !== 'number' || Number.isNaN(transparency)) return 1;
  return 1 - clampPercent(transparency) / 100;
};
const toHex = (value: number) => value.toString(16).padStart(2, '0');
const getMaterialKey = (material: StructureMaterial) =>
  material.UniqueId ?? (material.Id !== undefined ? String(material.Id) : material.Name);
const getMaterialColor = (material: StructureMaterial): MaterialColor => ({
  Red: material.Color?.Red ?? 203,
  Green: material.Color?.Green ?? 213,
  Blue: material.Color?.Blue ?? 245
});
const getMaterialColorHex = (material: StructureMaterial) => {
  const color = getMaterialColor(material);
  return `#${toHex(color.Red)}${toHex(color.Green)}${toHex(color.Blue)}`;
};
const filteredMaterialCatalog = computed(() => {
  const term = materialSearch.value.trim().toLowerCase();
  if (!term) return materialCatalog.value;
  return materialCatalog.value.filter((material) => normalizeMaterialName(material.Name).includes(term));
});
const getMaterialByKeyValue = (key: string) =>
  materialCatalog.value.find((material) => getMaterialKey(material) === key) ?? null;
const hexToRgb = (hex: string): MaterialColor | null => {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    Red: parseInt(normalized.slice(0, 2), 16),
    Green: parseInt(normalized.slice(2, 4), 16),
    Blue: parseInt(normalized.slice(4, 6), 16)
  };
};
const setMaterialCatalog = (materials: StructureMaterial[]) => {
  const normalized = materials.map((material) => ({
    ...material,
    Color: material.Color ? { ...material.Color } : undefined,
    Transparency:
      typeof material.Transparency === 'number' && !Number.isNaN(material.Transparency)
        ? clampPercent(material.Transparency)
        : 0
  }));
  materialCatalog.value = normalized;
  structureMaterials.clear();
  normalized.forEach((material) => {
    const key = normalizeMaterialName(material?.Name);
    if (key) structureMaterials.set(key, material);
  });
};
const getMaterialByName = (name?: string | null) => {
  if (!isMaterialNameValid(name)) return null;
  return structureMaterials.get(normalizeMaterialName(name)) ?? null;
};

const getMeshMaterials = (mesh: THREE.Mesh) =>
  (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];

const getMeshMaterialKeys = (mesh: THREE.Mesh) => {
  const keys = mesh.userData.materialKeys as string[] | undefined;
  return Array.isArray(keys) ? keys : null;
};

const ensureBaseColors = (mesh: THREE.Mesh, materials: THREE.MeshStandardMaterial[]) => {
  const existing = mesh.userData.baseColors as THREE.Color[] | undefined;
  if (!Array.isArray(existing) || existing.length !== materials.length) {
    const next = materials.map((mat) =>
      mat.color ? mat.color.clone() : new THREE.Color('#cbd5f5')
    );
    mesh.userData.baseColors = next;
    mesh.userData.baseColor = next[0];
    return next;
  }
  return existing;
};

const createStructureMaterial = (
  materialInfo: StructureMaterial | null,
  fallbackColor: THREE.Color
) => {
  const material = new THREE.MeshStandardMaterial({
    color: fallbackColor,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  if (materialInfo?.Color) {
    material.color.setRGB(
      materialInfo.Color.Red / 255,
      materialInfo.Color.Green / 255,
      materialInfo.Color.Blue / 255
    );
  }
  const opacity = getMaterialOpacity(materialInfo?.Transparency);
  material.opacity = opacity;
  material.transparent = opacity < 1;
  return material;
};

const applyMaterialToMeshes = (materialInfo: StructureMaterial) => {
  const materialKey = normalizeMaterialName(materialInfo.Name);
  const opacity = getMaterialOpacity(materialInfo.Transparency);
  const color = materialInfo.Color;

  structureMeshes.forEach((mesh, elementKey) => {
    const element = structureElements.get(elementKey);
    if (!element) return;
    const elementMaterials = getElementMaterialNames(element).map(normalizeMaterialName);
    if (!elementMaterials.includes(materialKey)) return;
    const mats = getMeshMaterials(mesh);
    const materialKeys = getMeshMaterialKeys(mesh);
    const baseColors = ensureBaseColors(mesh, mats);
    mats.forEach((mat, idx) => {
      if (materialKeys && materialKeys[idx] !== materialKey) return;
      if (color && mat.color) {
        mat.color.setRGB(color.Red / 255, color.Green / 255, color.Blue / 255);
      }
      mat.opacity = opacity;
      mat.transparent = opacity < 1;
      mat.needsUpdate = true;
      if (color) {
        baseColors[idx] = new THREE.Color(color.Red / 255, color.Green / 255, color.Blue / 255);
      }
    });
    if (color) {
      mesh.userData.baseColor = new THREE.Color(color.Red / 255, color.Green / 255, color.Blue / 255);
    }
    element.MaterialInfo = materialInfo;
  });
};

const applyStructureVisibility = () => {
  structureMeshes.forEach((mesh, id) => {
    const layer = getLayerMatch(mesh);
    const layerVisible = layer ? modelVisibility[layer.id] : true;
    const isHidden = hiddenStructureIds.has(id);
    const isolateId = isolatedStructureId.value;
    mesh.visible = layerVisible && !isHidden && (!isolateId || id === isolateId);
  });
};

const closeContextMenu = () => {
  contextMenuOpen.value = false;
  closeElementsContextMenu();
};

const openContextMenu = (event: MouseEvent) => {
  if (!canvasWrap.value) return;
  const rect = canvasWrap.value.getBoundingClientRect();
  const menuWidth = 200;
  const menuHeight = 170;
  const padding = 8;
  let x = event.clientX - rect.left;
  let y = event.clientY - rect.top;
  x = Math.min(x, rect.width - menuWidth - padding);
  y = Math.min(y, rect.height - menuHeight - padding);
  contextMenuPos.x = Math.max(padding, x);
  contextMenuPos.y = Math.max(padding, y);
  contextMenuOpen.value = true;
};

const hideSelectedStructure = () => {
  if (!selectedStructureId.value) return;
  hiddenStructureIds.add(selectedStructureId.value);
  if (isolatedStructureId.value === selectedStructureId.value) {
    isolatedStructureId.value = null;
  }
  applyStructureVisibility();
  clearStructureSelection();
  closeContextMenu();
};

const hideSelectedStructures = () => {
  if (!selectedStructureIds.size) return;
  selectedStructureIds.forEach((id) => {
    hiddenStructureIds.add(id);
  });
  if (isolatedStructureId.value && selectedStructureIds.has(isolatedStructureId.value)) {
    isolatedStructureId.value = null;
  }
  applyStructureVisibility();
  clearStructureSelection();
  closeContextMenu();
};

const isolateSelectedStructure = () => {
  if (!selectedStructureId.value) return;
  isolatedStructureId.value = selectedStructureId.value;
  applyStructureVisibility();
  closeContextMenu();
};

const isolateSelectedStructures = () => {
  if (!selectedStructureIds.size) return;
  if (selectedStructureIds.size === 1) {
    isolateSelectedStructure();
    return;
  }
  isolatedStructureId.value = null;
  hiddenStructureIds.clear();
  structureMeshes.forEach((_mesh, id) => {
    if (!selectedStructureIds.has(id)) {
      hiddenStructureIds.add(id);
    }
  });
  applyStructureVisibility();
  closeContextMenu();
};

const showAllStructures = () => {
  hiddenStructureIds.clear();
  isolatedStructureId.value = null;
  applyStructureVisibility();
  closeContextMenu();
};

const updateMaterialColor = (material: StructureMaterial, hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  material.Color = rgb;
  applyMaterialToMeshes(material);
  syncPopupMaterialInputs(material);
};

const updateMaterialTransparency = (material: StructureMaterial, transparency: number) => {
  if (Number.isNaN(transparency)) return;
  material.Transparency = clampPercent(transparency);
  applyMaterialToMeshes(material);
  syncPopupMaterialInputs(material);
};

const onMaterialColorInput = (material: StructureMaterial, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  updateMaterialColor(material, target.value);
};

const onMaterialTransparencyInput = (material: StructureMaterial, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  updateMaterialTransparency(material, Number(target.value));
};

const selectedStructureMaterials = computed<MaterialPreview[]>(() => {
  const element = selectedStructure.value;
  const names = getElementMaterialNames(element);
  if (!names.length) return [];
  const primaryName = getPrimaryMaterialName(element);
  const primaryKey = primaryName ? normalizeMaterialName(primaryName) : '';

  return names.map((rawName) => {
    const materialInfo = getMaterialByName(rawName);
    const transparency =
      typeof materialInfo?.Transparency === 'number' && !Number.isNaN(materialInfo.Transparency)
        ? clampPercent(materialInfo.Transparency)
        : null;
    const opacity = transparency !== null ? 1 - transparency / 100 : 1;
    const swatch = materialInfo?.Color
      ? `rgba(${materialInfo.Color.Red}, ${materialInfo.Color.Green}, ${materialInfo.Color.Blue}, ${opacity})`
      : null;
    return {
      name: materialInfo?.Name ?? rawName,
      swatch,
      transparency,
      matched: !!materialInfo,
      primary: normalizeMaterialName(rawName) === primaryKey
    };
  });
});

const getLayerMatch = (object: THREE.Object3D) => {
  const name = object.name?.toLowerCase() ?? '';
  const userLayer =
    typeof object.userData?.modelLayer === 'string' ? object.userData.modelLayer.toLowerCase() : '';
  return modelLayers.find(
    (layer) =>
      (userLayer && userLayer === layer.id) || layer.matches.some((match) => name.includes(match))
  );
};

const assignModelLayers = () => {
  modelLayerObjects.clear();
  modelLayers.forEach((layer) => modelLayerObjects.set(layer.id, []));
  if (!modelRoot) return;

  let assignedCount = 0;
  modelRoot.traverse((child) => {
    const match = getLayerMatch(child);
    if (!match) return;
    modelLayerObjects.get(match.id)?.push(child);
    assignedCount += 1;
  });

  if (assignedCount === 0) {
    modelLayerObjects.get('structure')?.push(modelRoot);
  }
};

const applyModelVisibility = () => {
  if (!modelRoot) return;
  modelLayers.forEach((layer) => {
    const targets = modelLayerObjects.get(layer.id);
    if (!targets?.length) return;
    const isVisible = modelVisibility[layer.id];
    targets.forEach((object) => {
      object.visible = isVisible;
    });
  });
  applyStructureVisibility();
};

const toggleModelVisibility = (layerId: string) => {
  modelVisibility[layerId] = !modelVisibility[layerId];
  applyModelVisibility();
  if (!modelVisibility[layerId] && selectedStructureMesh) {
    const layer = getLayerMatch(selectedStructureMesh);
    if (layer?.id === layerId) {
      clearStructureSelection();
    }
  }
};

const restoreStructureAppearance = (mesh: THREE.Mesh) => {
  const materials = getMeshMaterials(mesh);
  const baseColors = mesh.userData.baseColors as THREE.Color[] | undefined;
  const fallbackBase = mesh.userData.baseColor as THREE.Color | undefined;
  materials.forEach((material, idx) => {
    const baseColor = baseColors?.[idx] ?? fallbackBase;
    if (baseColor && material.color) {
      material.color.copy(baseColor);
    }
    if (material.emissive) {
      material.emissive.set('#000000');
    }
    material.emissiveIntensity = 1;
  });
};

const highlightStructureMesh = (mesh: THREE.Mesh) => {
  const materials = getMeshMaterials(mesh);
  materials.forEach((material) => {
    if (material.emissive) {
      material.emissive.set('#22d3ee');
    }
    material.emissiveIntensity = 0.65;
  });
};

const updateSelectionHighlights = () => {
  const nextMeshes = new Set<THREE.Mesh>();
  selectedStructureIds.forEach((id) => {
    const mesh = structureMeshes.get(id);
    if (mesh) nextMeshes.add(mesh);
  });

  highlightedStructureMeshes.forEach((mesh) => {
    if (!nextMeshes.has(mesh)) {
      restoreStructureAppearance(mesh);
      highlightedStructureMeshes.delete(mesh);
    }
  });

  nextMeshes.forEach((mesh) => {
    if (highlightedStructureMeshes.has(mesh)) return;
    highlightStructureMesh(mesh);
    highlightedStructureMeshes.add(mesh);
  });
};

const setSelectedStructureIds = (ids: string[], primaryId?: string | null) => {
  selectedStructureIds.clear();
  ids.forEach((id) => {
    if (id) selectedStructureIds.add(id);
  });
  const primary = primaryId ?? ids[0] ?? null;
  selectedStructureId.value = primary;
  selectedStructureMesh = primary ? structureMeshes.get(primary) ?? null : null;

  if (selectedStructureIds.size > 1 && isolatedStructureId.value) {
    isolatedStructureId.value = null;
  }
  selectedStructureIds.forEach((id) => {
    hiddenStructureIds.delete(id);
    const mesh = structureMeshes.get(id);
    if (!mesh) return;
    const layer = getLayerMatch(mesh);
    if (layer && !modelVisibility[layer.id]) {
      modelVisibility[layer.id] = true;
    }
  });
  applyModelVisibility();
  updateSelectionHighlights();
};

const applyStructureSelection = (mesh: THREE.Mesh | null) => {
  closeContextMenu();
  if (!mesh) {
    setSelectedStructureIds([]);
    return;
  }
  const id = (mesh.userData.structureId as string | undefined) ?? null;
  if (!id) return;
  setSelectedStructureIds([id], id);
};

const clearStructureSelection = () => {
  applyStructureSelection(null);
};

const selectStructureById = (id: string | null) => {
  if (!id) {
    setSelectedStructureIds([]);
    return;
  }
  setSelectedStructureIds([id], id);
};

const selectStructureFromTable = (element: StructureElement) => {
  selectStructureById(getElementKey(element));
};

const selectSimilarElements = (element: StructureElement) => {
  const baseKey = getElementSimilarityKey(element);
  const ids: string[] = [];
  structureElements.forEach((candidate, key) => {
    if (getElementSimilarityKey(candidate) === baseKey) {
      ids.push(key);
    }
  });
  if (!ids.length) return;
  setSelectedStructureIds(ids, getElementKey(element));
};

const closeElementsContextMenu = () => {
  elementsContextMenuOpen.value = false;
  elementsContextMenuTarget.value = null;
};

const openElementsContextMenu = (event: MouseEvent, element: StructureElement) => {
  if (!canvasWrap.value) return;
  event.preventDefault();
  contextMenuOpen.value = false;
  selectStructureFromTable(element);
  const rect = canvasWrap.value.getBoundingClientRect();
  const menuWidth = 200;
  const menuHeight = 170;
  const padding = 8;
  let x = event.clientX - rect.left;
  let y = event.clientY - rect.top;
  x = Math.min(x, rect.width - menuWidth - padding);
  y = Math.min(y, rect.height - menuHeight - padding);
  elementsContextMenuPos.x = Math.max(padding, x);
  elementsContextMenuPos.y = Math.max(padding, y);
  elementsContextMenuTarget.value = getElementKey(element);
  elementsContextMenuOpen.value = true;
};

const selectSimilarFromContextMenu = () => {
  const key = elementsContextMenuTarget.value;
  if (!key) return;
  const element = structureElements.get(key);
  if (!element) return;
  selectSimilarElements(element);
  closeElementsContextMenu();
};

const selectSimilarFromModelContextMenu = () => {
  const key = selectedStructureId.value;
  if (!key) return;
  const element = structureElements.get(key);
  if (!element) return;
  selectSimilarElements(element);
  closeContextMenu();
};

const clearStructureMeshes = () => {
  clearStructureSelection();
  hiddenStructureIds.clear();
  isolatedStructureId.value = null;
  clearSensorLabels();
  structureMeshes.forEach((mesh) => {
    mesh.parent?.remove(mesh);
    disposeMesh(mesh);
  });
  structureMeshes.clear();
  structureMeshList.length = 0;
  structureElements.clear();
  structureMaterials.clear();
  materialCatalog.value = [];
  structureElementList.value = [];
  Object.keys(elementDrafts).forEach((key) => {
    delete elementDrafts[key];
  });
  modelLayerObjects.clear();
  elementRecords.clear();
  resetElementMeta();
  elementsError.value = '';
  elementMutationError.value = '';
  if (modelRoot && scene) {
    scene.remove(modelRoot);
  }
  modelRoot = null;
};

const applyClippingToMeshMaterials = (mesh: THREE.Mesh, planes: THREE.Plane[] | null) => {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    (material as THREE.Material & { clippingPlanes?: THREE.Plane[] | null }).clippingPlanes = planes;
    (material as THREE.Material & { clipShadows?: boolean }).clipShadows = !!planes;
    (material as THREE.Material & { clipIntersection?: boolean }).clipIntersection = !!planes;
    material.needsUpdate = true;
    if (planes) {
      sensorClippedMaterials.add(material);
    }
  });
};

const enableSensorClipping = (planes: THREE.Plane[]) => {
  sensorClippedMaterials.clear();
  const applyToMesh = (mesh: THREE.Mesh) => applyClippingToMeshMaterials(mesh, planes);
  modelRoot?.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) applyToMesh(child as THREE.Mesh);
  });
  itemMeshes.forEach(applyToMesh);
};

const disableSensorClipping = () => {
  sensorClippedMaterials.forEach((material) => {
    (material as THREE.Material & { clippingPlanes?: THREE.Plane[] | null }).clippingPlanes = null;
    (material as THREE.Material & { clipShadows?: boolean }).clipShadows = false;
    (material as THREE.Material & { clipIntersection?: boolean }).clipIntersection = false;
    material.needsUpdate = true;
  });
  sensorClippedMaterials.clear();
};

const getViewportSize = () => {
  // Prefer the actual canvas container width; fall back to layout-based math.
  const containerWidth = container.value?.clientWidth;
  const containerHeight = container.value?.clientHeight;
  if (containerWidth && containerHeight) {
    return { width: containerWidth, height: containerHeight };
  }

  const layoutWidth = layoutRef.value?.clientWidth ?? window.innerWidth;
  const layoutHeight = layoutRef.value?.clientHeight ?? window.innerHeight;
  const width = Math.max(200, layoutWidth - leftPanelWidth.value - rightPanelWidth.value - 20);
  const height = Math.max(200, layoutHeight - 20);
  return { width, height };
};

const frameModel = (paddingMultiplier = 1.6) => {
  if (!camera || !controls) return;
  const fov = camera.fov * (Math.PI / 180);
  const cameraDist = Math.abs(modelMaxDim / (2 * Math.tan(fov / 2))) * paddingMultiplier;
  const offset = new THREE.Vector3(cameraDist / 2, cameraDist, cameraDist / 2);
  defaultCameraOffset = offset.clone();

  camera.position.copy(modelCenter).add(offset);
  controls.target.copy(modelCenter);
  controls.update();
};

const updateFloorHeights = (baseY: number, floorHeight?: number) => {
  modelBaseY = baseY;
  const span = floorHeight ?? DEFAULT_FLOOR_HEIGHT;
  floorHeights.ground = { minY: baseY, maxY: baseY + span };
  floorHeights.first = { minY: baseY + span, maxY: baseY + span * 2 };
  floorHeights.second = { minY: baseY + span * 2, maxY: baseY + span * 3 };
};

const updateSceneBounds = () => {
  const box = new THREE.Box3();
  let hasBounds = false;

  if (modelRoot) {
    box.setFromObject(modelRoot);
    hasBounds = true;
  }

  if (!hasBounds) return;

  modelBounds = box.clone();
  modelSize = box.getSize(new THREE.Vector3());
  modelCenter = box.getCenter(new THREE.Vector3());
  modelMaxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
  modelHeight = modelSize.y || 1;
  updateFloorHeights(box.min.y, DEFAULT_FLOOR_HEIGHT);

  if (mode.value === 'sensors') {
    frameModel();
    buildSensorView();
    return;
  }

  if (selectedFloor.value === 'all') {
    frameModel();
  }

  applyClipping();
};

const markers = new Map<string, HTMLDivElement>();
const sensorLabels = new Map<string, CSS2DObject>();
type SensorReadout = { temperature: number; humidity: number; co2: number };
type WeatherReadout = {
  temperature: number;
  feelsLike: number;
  windSpeed: number;
  windGust: number | null;
  description: string;
  humidity: number;
  pressure: number;
};
type SensorMetric = { key: string; label: string; value: string };
const sensorReadings = new Map<string, SensorReadout>();
const esp32Reading = ref<SensorReadout | null>(null);
const esp32Online = ref<boolean | null>(null);
const weatherReadings = new Map<string, WeatherReadout>();
const weatherReading = ref<WeatherReadout | null>(null);
const weatherOnline = ref<boolean | null>(null);
const editItem = reactive<EditItemState>({
  id: '',
  ...createEmptyForm()
});
const selectedItem = computed(() => items.value.find((i) => i.id === selectedItemId.value) || null);

const parseRoomsInput = (value: string) =>
  value
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

const toItemPayload = (state: ItemFormState) => {
  return {
    name: state.name.trim(),
    description: state.description.trim(),
    url: state.url.trim(),
    dateAdded: state.dateAdded || undefined,
    rooms: parseRoomsInput(state.rooms),
    position: { ...state.position }
  };
};

const resetNewItem = () => Object.assign(newItem, createEmptyForm());
const resetEditItem = () => Object.assign(editItem, { id: '', ...createEmptyForm() });
const resetElementMeta = () => Object.assign(elementMetaForm, createEmptyElementMeta());

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { statusMessage?: string } }).data;
    if (data?.statusMessage) return data.statusMessage;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};

const selectItem = (id: string) => {
  selectedItemId.value = id;
  updateMarkerStyles();
};

const updateMarkerStyles = () => {
  markers.forEach((el, id) => {
    if (id === selectedItemId.value) el.classList.add('marker--active');
    else el.classList.remove('marker--active');
  });
};

const setPointerFromEvent = (event: MouseEvent) => {
  if (!renderer?.domElement) return false;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return true;
};

const applyCanvasBackground = () => {
  if (!scene) return;
  const color = canvasBackground.value === 'light' ? '#ffffff' : '#000000';
  scene.background = new THREE.Color(color);
};

const toggleCanvasBackground = () => {
  canvasBackground.value = canvasBackground.value === 'light' ? 'dark' : 'light';
  applyCanvasBackground();
};

const applyLightSettings = () => {
  if (!scene) return;
  if (hemiLight) {
    hemiLight.intensity = lightSettings.hemi.intensity;
    hemiLight.color.set(lightSettings.hemi.color);
    hemiLight.groundColor.set(lightSettings.hemi.groundColor);
  }
  if (ambientLight) {
    ambientLight.intensity = lightSettings.ambient.intensity;
    ambientLight.color.set(lightSettings.ambient.color);
  }
  if (dirLight) {
    dirLight.intensity = lightSettings.directional.intensity;
    dirLight.color.set(lightSettings.directional.color);
  }
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

const syncElementsPopupTheme = () => {
  if (!elementsPopup || elementsPopup.closed) {
    elementsPopup = null;
    elementsPopupOpen.value = false;
    return;
  }
  const source = getComputedStyle(document.documentElement);
  themeVarNames.forEach((name) => {
    elementsPopup?.document.documentElement.style.setProperty(name, source.getPropertyValue(name));
  });
  elementsPopup.document.documentElement.setAttribute('data-theme', appTheme.value);
};

const syncPopupMaterialInputs = (material: StructureMaterial) => {
  if (!elementsPopup || elementsPopup.closed) return;
  const doc = elementsPopup.document;
  const key = getMaterialKey(material);
  const colorHex = getMaterialColorHex(material);
  const transparency = material.Transparency ?? 0;
  const inputs = Array.from(doc.querySelectorAll('input[data-key]')) as HTMLInputElement[];
  const colorInput: HTMLInputElement | null =
    inputs.find((input) => input.dataset.key === key && input.type === 'color') ?? null;
  const rangeInput: HTMLInputElement | null =
    inputs.find((input) => input.dataset.key === key && input.type === 'range') ?? null;
  const numberInput: HTMLInputElement | null =
    inputs.find((input) => input.dataset.key === key && input.type === 'number') ?? null;

  if (colorInput) {
    colorInput.value = colorHex;
    const label = colorInput.parentElement?.querySelector('.muted');
    if (label) label.textContent = colorHex;
  }
  if (rangeInput) rangeInput.value = String(transparency);
  if (numberInput) numberInput.value = String(transparency);
};

const syncElementsPopupSelection = () => {
  if (!elementsPopup || elementsPopup.closed) return;
  const doc = elementsPopup.document;
  const rows = Array.from(doc.querySelectorAll('tr[data-key]')) as HTMLTableRowElement[];
  if (!rows.length) return;
  const activeRow: HTMLTableRowElement | null =
    rows.find((row) => !!row.dataset.key && selectedStructureIds.has(row.dataset.key)) ?? null;
  rows.forEach((row) => {
    const isActive = !!row.dataset.key && selectedStructureIds.has(row.dataset.key);
    row.classList.toggle('elements-row--active', isActive);
  });
  if (activeRow) activeRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

const scrollSelectedElementRow = () => {
  if (!elementsTableWrap.value) return;
  const rows = Array.from(
    elementsTableWrap.value.querySelectorAll<HTMLTableRowElement>('tr[data-key]')
  );
  if (!rows.length) return;
  const primary = selectedStructureId.value;
  const row =
    (primary && rows.find((candidate) => candidate.dataset.key === primary)) ||
    rows.find((candidate) => candidate.classList.contains('elements-row--active'));
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

const renderElementsPopup = () => {
  if (!elementsPopup || elementsPopup.closed) {
    elementsPopup = null;
    elementsPopupOpen.value = false;
    return;
  }
  const doc = elementsPopup.document;
  const head = doc.head;
  if (head) {
    const iconHref = `${window.location.origin}/model-library.svg`;
    const iconLink = head.querySelector('link[rel="icon"][data-houseviewer="true"]') as HTMLLinkElement | null;
    const shortcutLink = head.querySelector('link[rel="shortcut icon"][data-houseviewer="true"]') as HTMLLinkElement | null;
    if (iconLink) {
      iconLink.href = iconHref;
    } else {
      const link = doc.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.href = iconHref;
      link.dataset.houseviewer = 'true';
      head.appendChild(link);
    }
    if (shortcutLink) {
      shortcutLink.href = iconHref;
    } else {
      const link = doc.createElement('link');
      link.rel = 'shortcut icon';
      link.href = iconHref;
      link.dataset.houseviewer = 'true';
      head.appendChild(link);
    }
  }
  const tabElements = doc.getElementById('tab-elements');
  const tabMaterials = doc.getElementById('tab-materials');
  const panelElements = doc.getElementById('panel-elements');
  const panelMaterials = doc.getElementById('panel-materials');
  const isElementsActive = elementsPanelTab.value === 'elements';
  if (tabElements && tabMaterials && panelElements && panelMaterials) {
    tabElements.classList.toggle('tab--active', isElementsActive);
    tabMaterials.classList.toggle('tab--active', !isElementsActive);
    panelElements.style.display = isElementsActive ? 'flex' : 'none';
    panelMaterials.style.display = isElementsActive ? 'none' : 'flex';
  }

  const input = doc.getElementById('elements-search') as HTMLInputElement | null;
  if (input && input.value !== elementTableSearch.value) {
    input.value = elementTableSearch.value;
  }
  const countEl = doc.getElementById('elements-count');
  if (countEl) {
    countEl.textContent = `${filteredStructureElements.value.length} / ${structureElementList.value.length}`;
  }
  const emptyEl = doc.getElementById('elements-empty');
  const tableWrap = doc.getElementById('elements-table-wrap');
  const tbody = doc.getElementById('elements-body');
  if (!tbody || !emptyEl || !tableWrap) return;

  if (structureElementList.value.length === 0) {
    emptyEl.textContent = 'No elements loaded.';
    emptyEl.style.display = 'block';
    tableWrap.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  if (filteredStructureElements.value.length === 0) {
    emptyEl.textContent = `No matches for "${elementTableSearch.value}".`;
    emptyEl.style.display = 'block';
    tableWrap.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  tableWrap.style.display = 'block';
  const rows = filteredStructureElements.value
    .map((element) => {
      const category = escapeHtml(element.Category || '-');
      const typeName = escapeHtml(element.TypeName || '-');
      const materials = getElementMaterialNames(element);
      const materialText = escapeHtml(materials.length ? materials.join(', ') : '-');
      const modelLabel = escapeHtml(getModelLayerLabel(element.ModelLayer));
      const record = getElementRecordForElement(element);
      const draft = ensureElementDraftByKey(getElementKey(element), record);
      const yearAdded = escapeHtml(draft?.yearAdded || record?.yearAdded || '-');
      const software = escapeHtml(draft?.softwareOriginator || record?.softwareOriginator || '-');
      const comment = escapeHtml(draft?.comment || record?.comment || '-');
      const isSelected = selectedStructureIds.has(getElementKey(element));
      if (isEditor.value) {
        return `<tr data-key="${escapeHtml(getElementKey(element))}" class="elements-row${isSelected ? ' elements-row--active' : ''}">
          <td class="elements-cell">${category}</td>
          <td class="elements-cell">${typeName}</td>
          <td class="elements-cell">${materialText}</td>
          <td class="elements-cell">${modelLabel}</td>
          <td class="elements-cell">
            <input class="elements-input" type="text" data-key="${escapeHtml(getElementKey(element))}" data-field="yearAdded" value="${yearAdded === '-' ? '' : yearAdded}" />
          </td>
          <td class="elements-cell">
            <input class="elements-input" type="text" data-key="${escapeHtml(getElementKey(element))}" data-field="softwareOriginator" value="${software === '-' ? '' : software}" />
          </td>
          <td class="elements-cell">
            <input class="elements-input" type="text" data-key="${escapeHtml(getElementKey(element))}" data-field="comment" value="${comment === '-' ? '' : comment}" />
          </td>
        </tr>`;
      }
      return `<tr data-key="${escapeHtml(getElementKey(element))}" class="elements-row${isSelected ? ' elements-row--active' : ''}">
        <td class="elements-cell">${category}</td>
        <td class="elements-cell">${typeName}</td>
        <td class="elements-cell">${materialText}</td>
        <td class="elements-cell">${modelLabel}</td>
        <td class="elements-cell">${yearAdded}</td>
        <td class="elements-cell">${software}</td>
        <td class="elements-cell">${comment}</td>
      </tr>`;
    })
    .join('');
  tbody.innerHTML = rows;

  const materialInput = doc.getElementById('materials-search') as HTMLInputElement | null;
  if (materialInput && materialInput.value !== materialSearch.value) {
    materialInput.value = materialSearch.value;
  }
  const materialsCount = doc.getElementById('materials-count');
  if (materialsCount) {
    materialsCount.textContent = `${filteredMaterialCatalog.value.length} / ${materialCatalog.value.length}`;
  }
  const materialsEmpty = doc.getElementById('materials-empty');
  const materialsWrap = doc.getElementById('materials-table-wrap');
  const materialsBody = doc.getElementById('materials-body');
  if (!materialsBody || !materialsEmpty || !materialsWrap) return;

  if (materialCatalog.value.length === 0) {
    materialsEmpty.textContent = 'No materials loaded.';
    materialsEmpty.style.display = 'block';
    materialsWrap.style.display = 'none';
    materialsBody.innerHTML = '';
    return;
  }

  if (filteredMaterialCatalog.value.length === 0) {
    materialsEmpty.textContent = `No matches for "${materialSearch.value}".`;
    materialsEmpty.style.display = 'block';
    materialsWrap.style.display = 'none';
    materialsBody.innerHTML = '';
    return;
  }

  materialsEmpty.style.display = 'none';
  materialsWrap.style.display = 'block';
  const materialRows = filteredMaterialCatalog.value
    .map((material) => {
      const key = escapeHtml(getMaterialKey(material));
      const name = escapeHtml(material.Name);
      const colorHex = escapeHtml(getMaterialColorHex(material));
      const transparency = material.Transparency ?? 0;
      return `<tr>
        <td class="material-cell material-cell--name">
          <span class="material-name">${name}</span>
        </td>
        <td class="material-cell">
          <div class="material-color">
            <input type="color" class="color-input" data-key="${key}" value="${colorHex}" />
            <span class="muted">${colorHex}</span>
          </div>
        </td>
        <td class="material-cell">
          <div class="material-transparency">
            <input type="range" min="0" max="100" step="1" data-key="${key}" value="${transparency}" />
            <div class="transparency-input">
              <input type="number" min="0" max="100" step="1" class="input input--tiny" data-key="${key}" value="${transparency}" />
              <span class="muted">%</span>
            </div>
          </div>
        </td>
      </tr>`;
    })
    .join('');
  materialsBody.innerHTML = materialRows;

  materialsBody.querySelectorAll('input[type="color"]').forEach((node) => {
    node.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const key = target.dataset.key;
      if (!key) return;
      const material = getMaterialByKeyValue(key);
      if (!material) return;
      updateMaterialColor(material, target.value);
      const label = target.parentElement?.querySelector('.muted');
      if (label) label.textContent = target.value;
    });
  });

  materialsBody.querySelectorAll('input[type="range"]').forEach((node) => {
    node.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const key = target.dataset.key;
      if (!key) return;
      const material = getMaterialByKeyValue(key);
      if (!material) return;
      updateMaterialTransparency(material, Number(target.value));
      const row = target.closest('tr');
      const numberInput = row?.querySelector<HTMLInputElement>('input[type="number"][data-key]');
      if (numberInput) numberInput.value = target.value;
    });
  });

  materialsBody.querySelectorAll('input[type="number"]').forEach((node) => {
    node.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const key = target.dataset.key;
      if (!key) return;
      const material = getMaterialByKeyValue(key);
      if (!material) return;
      updateMaterialTransparency(material, Number(target.value));
      const row = target.closest('tr');
      const rangeInput = row?.querySelector<HTMLInputElement>('input[type="range"][data-key]');
      if (rangeInput) rangeInput.value = target.value;
    });
  });

  tbody.querySelectorAll<HTMLTableRowElement>('tr[data-key]').forEach((row) => {
    row.addEventListener('click', () => {
      const key = row.dataset.key;
      if (!key) return;
      selectStructureById(key);
    });
    row.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      const key = row.dataset.key;
      if (!key) return;
      const element = structureElements.get(key);
      if (!element) return;
      selectStructureById(key);
      const menu = doc.getElementById('elements-context-menu');
      if (!menu) return;
      menu.setAttribute('data-key', key);
      menu.style.display = 'block';
      const width = doc.documentElement.clientWidth;
      const height = doc.documentElement.clientHeight;
      const menuWidth = 200;
      const menuHeight = 170;
      const padding = 8;
      const x = Math.min(event.clientX, width - menuWidth - padding);
      const y = Math.min(event.clientY, height - menuHeight - padding);
      menu.style.left = `${Math.max(padding, x)}px`;
      menu.style.top = `${Math.max(padding, y)}px`;
    });
  });

  if (isEditor.value) {
    tbody.querySelectorAll('input[data-field]').forEach((node) => {
      node.addEventListener('click', (event) => event.stopPropagation());
      node.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement;
        const key = target.dataset.key;
        const field = target.dataset.field as keyof ElementMetaFormState | undefined;
        if (!key || !field) return;
        const element = structureElements.get(key);
        if (!element) return;
        updateElementDraft(element, field, target.value);
      });
      node.addEventListener('blur', (event) => {
        const target = event.target as HTMLInputElement;
        const key = target.dataset.key;
        if (!key) return;
        const keys = getSelectionKeysForUpdate(key);
        void Promise.all(keys.map((selectedKey) => saveElementDraftByKey(selectedKey))).then(() => {
          renderElementsPopup();
        });
      });
    });
  }
};

const openElementsPopup = () => {
  showElementsTable.value = false;
  if (elementsPopup && !elementsPopup.closed) {
    elementsPopup.focus();
    renderElementsPopup();
    return;
  }
  const popup = window.open('/model-library.html', 'houseviewer-elements', 'width=720,height=560');
  if (!popup) {
    showElementsTable.value = true;
    return;
  }
  elementsPopup = popup;
  elementsPopupOpen.value = true;
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Model Library</title>
    <link rel="icon" type="image/svg+xml" href="/model-library.svg" />
    <link rel="shortcut icon" href="/model-library.svg" />
    <style>
      :root {
        color-scheme: light dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg-page);
        color: var(--text-primary);
      }
      button {
        cursor: pointer;
      }
      .panel {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100vh;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
      }
      .close {
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-size: 1.2rem;
        line-height: 1;
        padding: 0 4px;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tabs {
        display: flex;
        gap: 8px;
      }
      .tab {
        flex: 1;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--panel-bg-strong);
        color: var(--text-primary);
        font-size: 0.8rem;
        font-weight: 700;
      }
      .tab--active {
        background: var(--accent-gradient);
        color: var(--text-inverse);
        border-color: transparent;
        box-shadow: var(--accent-shadow);
      }
      .panel-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1;
        min-height: 0;
      }
      .input {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--panel-bg);
        color: var(--text-primary);
      }
      .muted {
        color: var(--text-muted);
        font-size: 0.78rem;
      }
      .table-wrap {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--panel-bg-strong);
        overflow: auto;
        flex: 1;
        min-height: 160px;
      }
      .material-color {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .color-input {
        width: 42px;
        height: 32px;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--panel-bg);
      }
      .material-transparency {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) auto;
        gap: 8px;
        align-items: center;
      }
      .transparency-input {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .input--tiny {
        padding: 6px 8px;
        font-size: 0.8rem;
        width: 64px;
      }
      .material-name {
        margin: 0;
        font-weight: 700;
        font-size: 0.9rem;
      }
      .material-cell--name {
        width: 40%;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 720px;
      }
      thead th {
        position: sticky;
        top: 0;
        background: var(--panel-bg);
        color: var(--text-soft);
        text-align: left;
        font-size: 0.72rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
      }
      tbody td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        vertical-align: middle;
        font-size: 0.85rem;
      }
      tbody tr:last-child td {
        border-bottom: 0;
      }
      tbody tr:hover {
        background: var(--panel-bg-hover);
      }
      .elements-row {
        cursor: pointer;
      }
      .elements-row--active {
        background: var(--elements-selected-bg);
        color: var(--elements-selected-text);
      }
      .elements-row--active td {
        background: var(--elements-selected-bg);
        color: var(--elements-selected-text);
      }
      .elements-row--active .elements-input {
        background: var(--elements-selected-bg);
        color: var(--elements-selected-text);
        border-color: var(--elements-selected-text);
      }
      .elements-input {
        width: 100%;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--panel-bg);
        color: var(--text-primary);
        font-size: 0.82rem;
      }
      .empty {
        padding: 10px;
      }
      .context-menu {
        position: fixed;
        z-index: 50;
        min-width: 200px;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid var(--border-soft);
        background: var(--panel-bg-glass-strong);
        box-shadow: var(--shadow-context);
        display: none;
      }
      .context-menu button {
        border: none;
        background: transparent;
        color: var(--text-primary);
        padding: 8px 10px;
        border-radius: 8px;
        text-align: left;
        font-size: 0.85rem;
        width: 100%;
      }
      .context-menu button:hover {
        background: var(--panel-bg-hover);
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <div class="header">
        <span></span>
        <button class="close" id="elements-close" aria-label="Close">×</button>
      </div>
      <div class="tabs">
        <button class="tab" id="tab-elements">Elements</button>
        <button class="tab" id="tab-materials">Materials</button>
      </div>
      <div id="panel-elements" class="panel-section">
        <div class="toolbar">
          <input id="elements-search" class="input" type="search" placeholder="Search elements..." />
          <span id="elements-count" class="muted"></span>
        </div>
        <div id="elements-empty" class="muted empty"></div>
        <div class="table-wrap" id="elements-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Element</th>
                <th scope="col">Type</th>
                <th scope="col">Material</th>
                <th scope="col">Model</th>
                <th scope="col">Year added</th>
                <th scope="col">Software</th>
                <th scope="col">Comment</th>
              </tr>
            </thead>
            <tbody id="elements-body"></tbody>
          </table>
        </div>
      </div>
      <div id="panel-materials" class="panel-section">
        <div class="toolbar">
          <input id="materials-search" class="input" type="search" placeholder="Search materials..." />
          <span id="materials-count" class="muted"></span>
        </div>
        <div id="materials-empty" class="muted empty"></div>
        <div class="table-wrap" id="materials-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Color</th>
                <th scope="col">Transparency</th>
              </tr>
            </thead>
            <tbody id="materials-body"></tbody>
          </table>
        </div>
      </div>
      <div id="elements-context-menu" class="context-menu">
        <button id="elements-select-similar" type="button">Select similar</button>
        <button id="elements-isolate-selected" type="button">Isolate selected</button>
        <button id="elements-hide-selected" type="button">Hide selected</button>
        <button id="elements-show-all" type="button">Show all</button>
      </div>
    </div>
  </body>
</html>`);
  popup.document.close();
  syncElementsPopupTheme();
  renderElementsPopup();
  syncElementsPopupSelection();

  const searchInput = popup.document.getElementById('elements-search') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = elementTableSearch.value;
    searchInput.addEventListener('input', () => {
      elementTableSearch.value = searchInput.value;
    });
  }
  const materialInput = popup.document.getElementById('materials-search') as HTMLInputElement | null;
  if (materialInput) {
    materialInput.value = materialSearch.value;
    materialInput.addEventListener('input', () => {
      materialSearch.value = materialInput.value;
    });
  }
  const tabElements = popup.document.getElementById('tab-elements');
  tabElements?.addEventListener('click', () => {
    elementsPanelTab.value = 'elements';
  });
  const tabMaterials = popup.document.getElementById('tab-materials');
  tabMaterials?.addEventListener('click', () => {
    elementsPanelTab.value = 'materials';
  });
  const closeButton = popup.document.getElementById('elements-close');
  closeButton?.addEventListener('click', () => {
    popup.close();
  });
  const popupMenu = popup.document.getElementById('elements-context-menu');
  const popupMenuAction = popup.document.getElementById('elements-select-similar');
  popupMenuAction?.addEventListener('click', () => {
    const key = popupMenu?.getAttribute('data-key') || '';
    if (!key) return;
    const element = structureElements.get(key);
    if (!element) return;
    selectSimilarElements(element);
    if (popupMenu) popupMenu.style.display = 'none';
  });
  popup.document.getElementById('elements-hide-selected')?.addEventListener('click', () => {
    hideSelectedStructures();
    if (popupMenu) popupMenu.style.display = 'none';
  });
  popup.document.getElementById('elements-isolate-selected')?.addEventListener('click', () => {
    isolateSelectedStructures();
    if (popupMenu) popupMenu.style.display = 'none';
  });
  popup.document.getElementById('elements-show-all')?.addEventListener('click', () => {
    showAllStructures();
    if (popupMenu) popupMenu.style.display = 'none';
  });
  popup.document.addEventListener('click', () => {
    if (popupMenu) popupMenu.style.display = 'none';
  });
  const handlePopupClose = () => {
    elementsPopup = null;
    elementsPopupOpen.value = false;
  };
  popup.addEventListener('beforeunload', handlePopupClose);
  popup.addEventListener('unload', handlePopupClose);
};

const toggleElementsPopup = () => {
  if (elementsPopupOpen.value && elementsPopup && !elementsPopup.closed) {
    elementsPopup.close();
    return;
  }
  if (showElementsTable.value) {
    showElementsTable.value = false;
    return;
  }
  openElementsPopup();
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
};

const isObjectVisible = (object: THREE.Object3D | null) => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
};

const getVisibleStructureMeshes = () => structureMeshList.filter((mesh) => isObjectVisible(mesh));

const fetchItems = async () => {
  itemsLoading.value = true;
  itemsError.value = '';
  try {
    const res = await $fetch<{ items: ItemRecord[] }>('/api/items', {
      headers: authHeaders.value
    });
    items.value = res.items;
    syncItemMeshes();
    updateSceneBounds();
    refreshClippingVisuals();
    refreshMarkerOverlay();
  } catch (err) {
    console.error(err);
    itemsError.value = getErrorMessage(err, 'Unable to load items');
  } finally {
    itemsLoading.value = false;
  }
};

const toElementSyncInput = (element: StructureElement): ElementSyncInput | null => {
  const guid = getElementKey(element);
  if (!guid) return null;
  const name = element.FamilyName || element.Category || element.TypeName || '';
  return {
    guid,
    revitId: element.Id,
    name,
    type: element.TypeName || '',
    material: getPrimaryMaterialName(element) || '',
    softwareOriginator: element.SoftwareOriginator || ''
  };
};

const syncElements = async (elements: StructureElement[]) => {
  elementsLoading.value = true;
  elementsError.value = '';
  try {
    const payload = elements
      .map(toElementSyncInput)
      .filter((element): element is ElementSyncInput => !!element);
    if (!payload.length) {
      elementRecords.clear();
      return;
    }
    const res = await $fetch<{ elements: ElementRecord[] }>('/api/elements/sync', {
      method: 'POST',
      body: { elements: payload },
      headers: authHeaders.value
    });
    res.elements.forEach((record) => {
      elementRecords.set(record.guid, record);
      ensureElementDraftByKey(record.guid, record);
    });
  } catch (err) {
    console.error(err);
    elementsError.value = getErrorMessage(err, 'Unable to sync elements');
  } finally {
    elementsLoading.value = false;
  }
};

const submitItem = async () => {
  if (mutationLoading.value) return;
  if (!newItem.name.trim()) {
    mutationError.value = 'Name is required';
    return;
  }

  mutationLoading.value = true;
  mutationError.value = '';
  const payload = toItemPayload(newItem);

  try {
    const res = await $fetch<{ item: ItemRecord }>('/api/items', {
      method: 'POST',
      body: payload,
      headers: authHeaders.value
    });

    itemsError.value = '';
    items.value.push(res.item);
    createItemMesh(res.item);
    refreshMarkerOverlay();
    selectItem(res.item.id);
    refreshClippingVisuals();
    resetNewItem();
  } catch (err) {
    console.error(err);
    mutationError.value = getErrorMessage(err, 'Failed to save item');
  } finally {
    mutationLoading.value = false;
  }
};

const updateSelectedItem = async () => {
  if (!selectedItem.value) return;
  if (mutationLoading.value) return;
  if (!editItem.name.trim()) {
    mutationError.value = 'Name is required';
    return;
  }

  mutationLoading.value = true;
  mutationError.value = '';
  const payload = toItemPayload(editItem);

  try {
    const res = await $fetch<{ item: ItemRecord }>(`/api/items/${selectedItem.value.id}`, {
      method: 'PUT',
      body: payload,
      headers: authHeaders.value
    });

    itemsError.value = '';
    const idx = items.value.findIndex((i) => i.id === res.item.id);
    if (idx !== -1) {
      items.value[idx] = res.item;
    }
    createItemMesh(res.item);
    refreshMarkerOverlay();
    refreshClippingVisuals();
  } catch (err) {
    console.error(err);
    mutationError.value = getErrorMessage(err, 'Failed to update item');
  } finally {
    mutationLoading.value = false;
  }
};

const deleteSelectedItem = async () => {
  if (!selectedItem.value) return;
  if (mutationLoading.value) return;
  const id = selectedItem.value.id;

  mutationLoading.value = true;
  mutationError.value = '';

  try {
    await $fetch(`/api/items/${id}`, { method: 'DELETE', headers: authHeaders.value });

    itemsError.value = '';
    const idx = items.value.findIndex((i) => i.id === id);
    if (idx !== -1) {
      items.value.splice(idx, 1);
    }

    const mesh = itemMeshes.get(id);
    if (mesh) {
      scene.remove(mesh);
      disposeMesh(mesh);
      itemMeshes.delete(id);
    }

    selectedItemId.value = null;
    resetEditItem();
    updateMarkerStyles();
    updateSceneBounds();
    refreshClippingVisuals();
    refreshMarkerOverlay();
  } catch (err) {
    console.error(err);
    mutationError.value = getErrorMessage(err, 'Failed to delete item');
  } finally {
    mutationLoading.value = false;
  }
};

const saveSelectedElementMeta = async () => {
  if (!selectedElementRecord.value || !selectedStructureId.value) return;
  if (elementMutationLoading.value) return;

  elementMutationLoading.value = true;
  elementMutationError.value = '';
  const payload = {
    yearAdded: elementMetaForm.yearAdded.trim(),
    softwareOriginator: elementMetaForm.softwareOriginator.trim(),
    comment: elementMetaForm.comment.trim()
  };

  try {
    const res = await $fetch<{ element: ElementRecord }>(
      `/api/elements/${selectedElementRecord.value.guid}`,
      {
        method: 'PUT',
        body: payload,
        headers: authHeaders.value
      }
    );
    elementRecords.set(res.element.guid, res.element);
    ensureElementDraftByKey(res.element.guid, res.element);
  } catch (err) {
    console.error(err);
    elementMutationError.value = getErrorMessage(err, 'Failed to update element metadata');
  } finally {
    elementMutationLoading.value = false;
  }
};

const initThree = () => {
  scene = new THREE.Scene();
  applyCanvasBackground();

  const { width, height } = getViewportSize();

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(6, 5, 8);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  renderer.autoClearStencil = true;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (labelRenderer) {
    labelRenderer.domElement.remove();
    labelRenderer = null;
  }
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelRenderer.domElement.style.zIndex = '3';

  hemiLight = new THREE.HemisphereLight(
    lightSettings.hemi.color,
    lightSettings.hemi.groundColor,
    lightSettings.hemi.intensity
  );
  hemiLight.position.set(0, 20, 0);

  ambientLight = new THREE.AmbientLight(lightSettings.ambient.color, lightSettings.ambient.intensity);

  dirLight = new THREE.DirectionalLight(lightSettings.directional.color, lightSettings.directional.intensity);
  dirLight.position.set(0, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.far = 50;

  scene.add(hemiLight, ambientLight, dirLight);
  applyLightSettings();

  if (container.value) {
    container.value.querySelectorAll('canvas').forEach((node) => node.remove());
    container.value.prepend(renderer.domElement);
    container.value.appendChild(labelRenderer.domElement);
  }
};

const dedupeMaterials = (materials: StructureMaterial[]) => {
  const byName = new Map<string, StructureMaterial>();
  materials.forEach((material) => {
    const key = normalizeMaterialName(material?.Name);
    if (!key) return;
    byName.set(key, material);
  });
  return Array.from(byName.values());
};

const addModelElements = (
  elements: StructureElement[],
  layerId: string,
  baseColor: THREE.Color,
  targetGroup: THREE.Group
) => {
  let created = 0;

  elements.forEach((element) => {
    const geom = element.Geometry;
    if (!geom?.Vertices?.length || !geom?.Indices?.length) return;
    element.ModelLayer = layerId;

    let geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(geom.Vertices);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(geom.Indices);

    const primaryName = getPrimaryMaterialName(element);
    const primaryMaterial = primaryName ? getMaterialByName(primaryName) : null;
    element.MaterialInfo = primaryMaterial;

    const triangleMaterials = Array.isArray(geom.TriangleMaterialNames)
      ? geom.TriangleMaterialNames
      : [];
    const triangleCount = Math.floor(geom.Indices.length / 3);
    const hasTriangleMaterials = triangleMaterials.length === triangleCount && triangleCount > 0;

    let material: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
    let materialKeys: string[] | null = null;

    if (hasTriangleMaterials) {
      geometry = geometry.toNonIndexed();
      geometry.clearGroups();

      const materialIndexByKey = new Map<string, number>();
      const materials: THREE.MeshStandardMaterial[] = [];
      const keys: string[] = [];

      const getMaterialIndex = (name?: string | null) => {
        const resolvedName = isMaterialNameValid(name) ? name.trim() : primaryName ?? '';
        const key = normalizeMaterialName(resolvedName || 'default');
        let idx = materialIndexByKey.get(key);
        if (idx === undefined) {
          const info = resolvedName ? getMaterialByName(resolvedName) : primaryMaterial;
          const mat = createStructureMaterial(info, baseColor);
          idx = materials.length;
          materials.push(mat);
          materialIndexByKey.set(key, idx);
          keys.push(key);
        }
        return idx;
      };

      let currentIndex = -1;
      let runStart = 0;
      triangleMaterials.forEach((name, idx) => {
        const matIndex = getMaterialIndex(name);
        if (currentIndex === -1) {
          currentIndex = matIndex;
          runStart = idx;
          return;
        }
        if (matIndex !== currentIndex) {
          geometry.addGroup(runStart * 3, (idx - runStart) * 3, currentIndex);
          runStart = idx;
          currentIndex = matIndex;
        }
      });
      if (currentIndex !== -1) {
        geometry.addGroup(runStart * 3, (triangleMaterials.length - runStart) * 3, currentIndex);
      }

      material = materials;
      materialKeys = keys;
    } else {
      geometry = geometry.toNonIndexed();
      material = createStructureMaterial(primaryMaterial, baseColor);
      materialKeys = primaryName ? [normalizeMaterialName(primaryName)] : null;
    }

    geometry.computeVertexNormals();
    geometry.normalizeNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const elementKey = getElementKey(element);
    mesh.name = element.TypeName || element.Category || elementKey;
    mesh.userData.structureId = elementKey;
    mesh.userData.modelLayer = layerId;
    const materialList = Array.isArray(material) ? material : [material];
    mesh.userData.baseColors = materialList.map((mat) => mat.color.clone());
    mesh.userData.baseColor = mesh.userData.baseColors[0];
    if (materialKeys) {
      mesh.userData.materialKeys = materialKeys;
    }

    structureElements.set(elementKey, element);
    structureMeshes.set(elementKey, mesh);
    structureMeshList.push(mesh);
    targetGroup.add(mesh);
    created += 1;
  });

  return created;
};

const loadStructureModel = async () => {
  loadingModel.value = true;
  modelError.value = '';
  sensorBoxInitialized = false;

  try {
    const structureUrl = runtimeConfig.public.structureModel || '/models/House_structure.json';
    const finishesUrl = runtimeConfig.public.finishesModel || '/models/House_Finishes.json';
    const plumbingUrl = runtimeConfig.public.plumbingModel || '/models/House_Plumbing.json';
    const sensorsUrl = runtimeConfig.public.sensorsModel || '/models/House_Sensors.json';
    const landscapeUrl = runtimeConfig.public.landscapeModel || '/models/House_Landscape.json';
    const adjacentBuildingsUrl =
      runtimeConfig.public.adjacentBuildingsModel || '/models/House_AdjacentBuildings.json';

    const structureResponse = await fetch(structureUrl);
    if (!structureResponse.ok) {
      throw new Error(`Failed to load structure model (${structureResponse.status})`);
    }
    const structureData = await structureResponse.json();
    const structureElementsData: StructureElement[] = Array.isArray(structureData)
      ? structureData
      : structureData?.Elements ?? [];
    const structureMaterialsData: StructureMaterial[] = Array.isArray(structureData?.Materials)
      ? structureData.Materials
      : [];

    if (!Array.isArray(structureElementsData) || structureElementsData.length === 0) {
      throw new Error('Structure model has no elements');
    }

    let finishesElementsData: StructureElement[] = [];
    let finishesMaterialsData: StructureMaterial[] = [];
    let plumbingElementsData: StructureElement[] = [];
    let plumbingMaterialsData: StructureMaterial[] = [];
    let sensorsElementsData: StructureElement[] = [];
    let sensorsMaterialsData: StructureMaterial[] = [];
    let landscapeElementsData: StructureElement[] = [];
    let landscapeMaterialsData: StructureMaterial[] = [];
    let adjacentElementsData: StructureElement[] = [];
    let adjacentMaterialsData: StructureMaterial[] = [];
    const warnings: string[] = [];

    try {
      const finishesResponse = await fetch(finishesUrl);
      if (!finishesResponse.ok) {
        warnings.push(`Failed to load finishes model (${finishesResponse.status})`);
      } else {
        const finishesData = await finishesResponse.json();
        finishesElementsData = Array.isArray(finishesData)
          ? finishesData
          : finishesData?.Elements ?? [];
        finishesMaterialsData = Array.isArray(finishesData?.Materials) ? finishesData.Materials : [];
        if (!Array.isArray(finishesElementsData)) {
          finishesElementsData = [];
        }
      }
    } catch (err) {
      console.warn('Failed to load finishes model', err);
      warnings.push('Failed to load finishes model');
    }

    try {
      const plumbingResponse = await fetch(plumbingUrl);
      if (!plumbingResponse.ok) {
        warnings.push(`Failed to load plumbing model (${plumbingResponse.status})`);
      } else {
        const plumbingData = await plumbingResponse.json();
        plumbingElementsData = Array.isArray(plumbingData) ? plumbingData : plumbingData?.Elements ?? [];
        plumbingMaterialsData = Array.isArray(plumbingData?.Materials) ? plumbingData.Materials : [];
        if (!Array.isArray(plumbingElementsData)) {
          plumbingElementsData = [];
        }
      }
    } catch (err) {
      console.warn('Failed to load plumbing model', err);
      warnings.push('Failed to load plumbing model');
    }

    try {
      const sensorsResponse = await fetch(sensorsUrl);
      if (!sensorsResponse.ok) {
        warnings.push(`Failed to load sensors model (${sensorsResponse.status})`);
      } else {
        const sensorsData = await sensorsResponse.json();
        sensorsElementsData = Array.isArray(sensorsData) ? sensorsData : sensorsData?.Elements ?? [];
        sensorsMaterialsData = Array.isArray(sensorsData?.Materials) ? sensorsData.Materials : [];
        if (!Array.isArray(sensorsElementsData)) {
          sensorsElementsData = [];
        }
      }
    } catch (err) {
      console.warn('Failed to load sensors model', err);
      warnings.push('Failed to load sensors model');
    }

    try {
      const landscapeResponse = await fetch(landscapeUrl);
      if (!landscapeResponse.ok) {
        warnings.push(`Failed to load landscape model (${landscapeResponse.status})`);
      } else {
        const landscapeData = await landscapeResponse.json();
        landscapeElementsData = Array.isArray(landscapeData)
          ? landscapeData
          : landscapeData?.Elements ?? [];
        landscapeMaterialsData = Array.isArray(landscapeData?.Materials) ? landscapeData.Materials : [];
        if (!Array.isArray(landscapeElementsData)) {
          landscapeElementsData = [];
        }
      }
    } catch (err) {
      console.warn('Failed to load landscape model', err);
      warnings.push('Failed to load landscape model');
    }

    try {
      const adjacentResponse = await fetch(adjacentBuildingsUrl);
      if (!adjacentResponse.ok) {
        warnings.push(`Failed to load adjacent buildings model (${adjacentResponse.status})`);
      } else {
        const adjacentData = await adjacentResponse.json();
        adjacentElementsData = Array.isArray(adjacentData)
          ? adjacentData
          : adjacentData?.Elements ?? [];
        adjacentMaterialsData = Array.isArray(adjacentData?.Materials) ? adjacentData.Materials : [];
        if (!Array.isArray(adjacentElementsData)) {
          adjacentElementsData = [];
        }
      }
    } catch (err) {
      console.warn('Failed to load adjacent buildings model', err);
      warnings.push('Failed to load adjacent buildings model');
    }

    clearStructureMeshes();

    const combinedMaterials = dedupeMaterials([
      ...structureMaterialsData,
      ...finishesMaterialsData,
      ...plumbingMaterialsData,
      ...sensorsMaterialsData,
      ...landscapeMaterialsData,
      ...adjacentMaterialsData
    ]);
    setMaterialCatalog(combinedMaterials);

    const allElements = [
      ...structureElementsData,
      ...finishesElementsData,
      ...plumbingElementsData,
      ...sensorsElementsData,
      ...landscapeElementsData,
      ...adjacentElementsData
    ];
    if (allElements.length) {
      void syncElements(allElements);
    }

    const group = new THREE.Group();
    group.name = 'ModelRoot';
    // Revit exports Z-up; rotate to Three.js Y-up.
    group.rotation.x = -Math.PI / 2;
    const baseColor = new THREE.Color('#cbd5f5');

    const structureGroup = new THREE.Group();
    structureGroup.name = 'StructureModel';
    structureGroup.userData.modelLayer = 'structure';
    addModelElements(structureElementsData, 'structure', baseColor, structureGroup);
    group.add(structureGroup);

    if (finishesElementsData.length) {
      const finishesGroup = new THREE.Group();
      finishesGroup.name = 'FinishesModel';
      finishesGroup.userData.modelLayer = 'finishes';
      addModelElements(finishesElementsData, 'finishes', baseColor, finishesGroup);
      group.add(finishesGroup);
    }

    if (plumbingElementsData.length) {
      const plumbingGroup = new THREE.Group();
      plumbingGroup.name = 'PlumbingModel';
      plumbingGroup.userData.modelLayer = 'plumbing';
      addModelElements(plumbingElementsData, 'plumbing', baseColor, plumbingGroup);
      group.add(plumbingGroup);
    }

    if (sensorsElementsData.length) {
      const sensorsGroup = new THREE.Group();
      sensorsGroup.name = 'SensorsModel';
      sensorsGroup.userData.modelLayer = 'sensors';
      addModelElements(sensorsElementsData, 'sensors', baseColor, sensorsGroup);
      group.add(sensorsGroup);
    }

    if (landscapeElementsData.length) {
      const landscapeGroup = new THREE.Group();
      landscapeGroup.name = 'LandscapeModel';
      landscapeGroup.userData.modelLayer = 'landscape';
      addModelElements(landscapeElementsData, 'landscape', baseColor, landscapeGroup);
      group.add(landscapeGroup);
    }

    if (adjacentElementsData.length) {
      const adjacentGroup = new THREE.Group();
      adjacentGroup.name = 'AdjacentBuildingsModel';
      adjacentGroup.userData.modelLayer = 'adjacent';
      addModelElements(adjacentElementsData, 'adjacent', baseColor, adjacentGroup);
      group.add(adjacentGroup);
    }

    if (!structureMeshList.length) {
      throw new Error('No valid structure geometry found');
    }

    modelRoot = group;
    scene.add(group);
    assignModelLayers();
    applyModelVisibility();
    refreshStructureElementList();
    refreshSensorOverlay();

    // Frame the model on load so it starts fully in view.
    updateSceneBounds();
    frameModel();
    if (mode.value !== 'sensors') {
      applyClipping();
    }

    if (mode.value === 'sensors') {
      buildSensorView();
    }

    if (warnings.length) {
      modelError.value = `${warnings.join(' | ')}. Ensure JSON exists in public/models.`;
    }
  } catch (err) {
    console.error(err);
    modelError.value = 'Failed to load structure model. Ensure JSON exists at public/models/House_structure.json';
  } finally {
    loadingModel.value = false;
  }
};

const setFloor = (floor: 'all' | 'ground' | 'first' | 'second') => {
  selectedFloor.value = floor;
  applyClipping();
  if (floor === 'all') {
    frameModel();
    return;
  }

  const cfg = floorHeights[floor];
  if (floor === 'second' && floorHeights.first.maxY !== undefined) {
    const topPlane = floorHeights.first.maxY - 5;
    const target = new THREE.Vector3(modelCenter.x, topPlane, modelCenter.z);
    controls.target.copy(target);
    camera.position.copy(target).add(defaultCameraOffset);
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }
  const sliceCenterY =
    cfg.minY !== undefined && cfg.maxY !== undefined
      ? (cfg.minY + cfg.maxY) / 2
      : cfg.minY ?? cfg.maxY ?? modelCenter.y;

  const target = new THREE.Vector3(modelCenter.x, sliceCenterY, modelCenter.z);
  controls.target.copy(target);
  camera.position.copy(target).add(defaultCameraOffset);
  camera.updateProjectionMatrix();
  controls.update();
};

const applyClipping = () => {
  if (mode.value === 'sensors') {
    renderer.clippingPlanes = sensorPlanes;
    return;
  }

  disableSensorClipping();
  disposeCaps(clipCapMeshes, clipStencilGroups);

  const floor = selectedFloor.value;
  const cfg = floorHeights[floor];
  clipPlanes = [];
  clipHelpers.forEach((helper) => {
    scene.remove(helper);
    helper.geometry.dispose();
    if (Array.isArray(helper.material)) helper.material.forEach((m) => m.dispose());
    else helper.material.dispose();
  });
  clipHelpers.length = 0;

  // Show full model when "all" is selected.
  if (floor === 'all') {
    renderer.clippingPlanes = [];
    disableSensorClipping();
    disposeCaps(clipCapMeshes, clipStencilGroups);
    return;
  }

  let minY = cfg.minY;
  let maxY = cfg.maxY;

  if (floor === 'ground' && maxY !== undefined) {
    maxY = maxY - 4; // lower the cap slightly
    minY = undefined; // ground floor: use only the top clipping plane
  }

  if (floor === 'first') {
    minY = undefined; // first floor: remove bottom plane
    const groundTop = floorHeights.ground.maxY !== undefined ? floorHeights.ground.maxY - 4 : maxY;
    if (groundTop !== undefined) {
      maxY = groundTop + 3; // 3 units above the adjusted ground cap
    }
  }

  if (floor === 'second') {
    minY = undefined; // second floor: single top plane only
    const firstTop = floorHeights.first.maxY;
    if (firstTop !== undefined) {
      maxY = firstTop - 5;
    }
  }

  if (maxY !== undefined && minY !== undefined && maxY <= minY) {
    maxY = minY + 0.1;
  }

  const sliceHeight = (maxY ?? 0) - (minY ?? 0);
  const helperSize = Math.max(modelMaxDim * 1.2, modelHeight * 1.2, sliceHeight || 0, 500);

  // Keep geometry where y >= minY
  if (minY !== undefined) {
    const minPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY);
    clipPlanes.push(minPlane);
    if (debugClipping.value) {
      const helper = new THREE.PlaneHelper(minPlane, helperSize, 0x22d3ee);
      clipHelpers.push(helper);
      scene.add(helper);
    }
  }

  // Keep geometry where y <= maxY
  if (maxY !== undefined) {
    const maxPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), maxY);
    clipPlanes.push(maxPlane);
    if (debugClipping.value) {
      const helper = new THREE.PlaneHelper(maxPlane, helperSize, 0xf97316);
      clipHelpers.push(helper);
      scene.add(helper);
    }
  }

  renderer.clippingPlanes = clipPlanes;
  enableSensorClipping(clipPlanes);

  clipDebugInfo.value = { planes: clipPlanes.map((p) => ({ normal: p.normal.clone(), constant: p.constant })), caps: 0 };

  if (!clipPlanes.length || !modelRoot) return;
  const capSize = Math.max(helperSize, modelMaxDim * 2.5, modelHeight * 2.5);
  const sliceCenterY =
    maxY !== undefined && minY !== undefined ? (maxY + minY) / 2 : modelCenter.y;
  const capCenter = new THREE.Vector3(modelCenter.x, sliceCenterY, modelCenter.z);
  buildCapsForPlanes(clipPlanes, capCenter, capSize, clipCapMeshes, clipStencilGroups, () => clipPlanes);
  clipDebugInfo.value.caps = clipCapMeshes.length;
};

const refreshClippingVisuals = () => {
  if (mode.value === 'sensors') {
    buildSensorView();
  } else {
    applyClipping();
  }
};

const getModelMeshes = () => {
  const meshes: THREE.Mesh[] = [];
  modelRoot?.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });
  return meshes;
};

const getClippableMeshes = () => [...getModelMeshes(), ...Array.from(itemMeshes.values())];
const getCapColor = () => {
  if (capColorMode.value === 'gray') return new THREE.Color('#9ca3af');
  for (const mesh of getClippableMeshes()) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if ((mat as THREE.Material & { color?: THREE.Color }).color) {
        return (mat as THREE.Material & { color: THREE.Color }).color.clone();
      }
    }
  }
  return new THREE.Color('#9ca3af');
};

const alignObjectToPlane = (obj: THREE.Object3D, plane: THREE.Plane, pullTowards?: THREE.Vector3) => {
  const epsilon = Math.max(modelMaxDim * 0.002, 0.01);
  if (pullTowards) {
    const projected = new THREE.Vector3();
    plane.projectPoint(pullTowards, projected);
    projected.add(plane.normal.clone().multiplyScalar(epsilon));
    obj.position.copy(projected);
  } else {
    const baseTarget = plane.normal.clone().multiplyScalar(-plane.constant);
    obj.position.copy(baseTarget);
  }
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
  obj.setRotationFromQuaternion(quat);
};

const createClipBypass = (restorePlanes: () => THREE.Plane[]) => {
  let prev: THREE.Plane[] | null = null;
  return {
    onBeforeRender: (r: THREE.WebGLRenderer) => {
      prev = r.clippingPlanes ? [...r.clippingPlanes] : [];
      r.clippingPlanes = [];
    },
    onAfterRender: (r: THREE.WebGLRenderer) => {
      r.clippingPlanes = prev ?? restorePlanes();
      prev = null;
    }
  };
};

const createPlaneStencilGroup = (geometry: THREE.BufferGeometry, plane: THREE.Plane, renderOrder: number) => {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial({
    depthWrite: false,
    depthTest: true,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc
  });

  const backMat = baseMat.clone();
  backMat.side = THREE.BackSide;
  backMat.clippingPlanes = [plane];
  backMat.stencilFail = THREE.IncrementWrapStencilOp;
  backMat.stencilZFail = THREE.IncrementWrapStencilOp;
  backMat.stencilZPass = THREE.IncrementWrapStencilOp;

  const backMesh = new THREE.Mesh(geometry, backMat);
  backMesh.renderOrder = renderOrder;
  group.add(backMesh);

  const frontMat = baseMat.clone();
  frontMat.side = THREE.FrontSide;
  frontMat.clippingPlanes = [plane];
  frontMat.stencilFail = THREE.DecrementWrapStencilOp;
  frontMat.stencilZFail = THREE.DecrementWrapStencilOp;
  frontMat.stencilZPass = THREE.DecrementWrapStencilOp;

  const frontMesh = new THREE.Mesh(geometry, frontMat);
  frontMesh.renderOrder = renderOrder;
  group.add(frontMesh);
  return group;
};

const disposeCaps = (
  capMeshes: THREE.Mesh[],
  stencilGroups: { parent: THREE.Object3D; group: THREE.Group }[]
) => {
  stencilGroups.splice(0).forEach(({ parent, group }) => {
    parent.remove(group);
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m.dispose());
      }
    });
  });

  capMeshes.splice(0).forEach((mesh) => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
  });
};

const disposeSensorVisuals = () => {
  sensorActiveIndex = null;
  disposeCaps(sensorCapMeshes, sensorStencilGroups);
  sensorPlaneMeshes.splice(0).forEach((mesh) => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
  });

  sensorHitMeshes.splice(0).forEach((mesh) => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
  });

  if (sensorBoxHelper) {
    scene.remove(sensorBoxHelper);
    sensorBoxHelper.geometry.dispose();
    (sensorBoxHelper.material as THREE.Material).dispose();
    sensorBoxHelper = null;
  }

  sensorPlanes.length = 0;
};

const setSensorBoxToBounds = () => {
  if (!modelRoot) return;
  const bounds = modelBounds.clone().expandByScalar(0);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.lengthSq() === 0) return;
  sensorBoxMin = bounds.min.clone();
  sensorBoxMax = bounds.max.clone();
  sensorBoxSize = sensorBoxMax.clone().sub(sensorBoxMin);
  sensorBoxInitialized = true;
};

const clampSensorBoxToBounds = () => {
  const minGap = Math.max(0.25, modelMaxDim * 0.01);
  sensorBoxMin.x = THREE.MathUtils.clamp(sensorBoxMin.x, modelBounds.min.x, sensorBoxMax.x - minGap);
  sensorBoxMax.x = THREE.MathUtils.clamp(sensorBoxMax.x, sensorBoxMin.x + minGap, modelBounds.max.x);
  sensorBoxMin.y = THREE.MathUtils.clamp(sensorBoxMin.y, modelBounds.min.y, sensorBoxMax.y - minGap);
  sensorBoxMax.y = THREE.MathUtils.clamp(sensorBoxMax.y, sensorBoxMin.y + minGap, modelBounds.max.y);
  sensorBoxMin.z = THREE.MathUtils.clamp(sensorBoxMin.z, modelBounds.min.z, sensorBoxMax.z - minGap);
  sensorBoxMax.z = THREE.MathUtils.clamp(sensorBoxMax.z, sensorBoxMin.z + minGap, modelBounds.max.z);
};

const applySensorBoxVisibility = () => {
  const visible = sensorBoxVisible.value;
  sensorPlaneMeshes.forEach((m) => (m.visible = visible && debugClipping.value));
  sensorHitMeshes.forEach((m) => (m.visible = visible));
  // Keep caps visible even when the box visuals are hidden.
  sensorCapMeshes.forEach((m) => (m.visible = true));
  if (sensorBoxHelper) sensorBoxHelper.visible = visible;
};

const buildCapsForPlanes = (
  planes: THREE.Plane[],
  boxCenter: THREE.Vector3,
  capSize: number,
  capMeshes: THREE.Mesh[],
  stencilGroups: { parent: THREE.Object3D; group: THREE.Group }[],
  restorePlanes: () => THREE.Plane[],
  forceOnTop = false
) => {
  if (!renderer || !planes.length) return;
  disposeCaps(capMeshes, stencilGroups);
  const stencilOrder = -20;
  const capOrderStart = 20;
  const capColor = getCapColor();

  const meshes = getClippableMeshes();
  meshes.forEach((mesh) => {
    if (!(mesh.geometry as THREE.BufferGeometry)) return;
    planes.forEach((plane, idx) => {
      const group = createPlaneStencilGroup(
        mesh.geometry as THREE.BufferGeometry,
        plane,
        stencilOrder + idx * 0.01
      );
      const groupBypass = createClipBypass(restorePlanes);
      group.onBeforeRender = groupBypass.onBeforeRender;
      group.onAfterRender = groupBypass.onAfterRender;
      mesh.add(group);
      stencilGroups.push({ parent: mesh, group });
    });
  });

  const debugCapsVisible = debugClipping.value;
  const renderOnTop = forceOnTop || debugCapsVisible;
  const baseCapMaterial = new THREE.MeshStandardMaterial({
    color: debugCapsVisible ? '#f97316' : capColor,
    metalness: 0.05,
    roughness: 0.82,
    side: THREE.DoubleSide,
    depthTest: !renderOnTop,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -0.1,
    polygonOffsetUnits: -4,
    clipIntersection: true,
    clippingPlanes: planes,
    transparent: true,
    opacity: debugCapsVisible ? 0.7 : 0.95,
    stencilWrite: !debugCapsVisible,
    stencilRef: 0,
    stencilFunc: debugCapsVisible ? THREE.AlwaysStencilFunc : THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp
  });

  planes.forEach((plane, idx) => {
    const mat = baseCapMaterial.clone();
    mat.clippingPlanes = planes.filter((_, i) => i !== idx);
    const capMesh = new THREE.Mesh(new THREE.PlaneGeometry(capSize, capSize), mat);
    capMesh.frustumCulled = false;
    capMesh.renderOrder = renderOnTop ? 999 : capOrderStart + idx;
    const capBypass = createClipBypass(restorePlanes);
    capMesh.onBeforeRender = capBypass.onBeforeRender;
    capMesh.onAfterRender = capBypass.onAfterRender;
    alignObjectToPlane(capMesh, plane, boxCenter);
    capMeshes.push(capMesh);
    scene.add(capMesh);
  });
};

const updateCapsForPlanes = (
  planes: THREE.Plane[],
  boxCenter: THREE.Vector3,
  capMeshes: THREE.Mesh[],
  forceOnTop = false
) => {
  capMeshes.forEach((mesh, idx) => {
    if (planes[idx]) alignObjectToPlane(mesh, planes[idx], boxCenter);
    const debugCapsVisible = debugClipping.value;
    const renderOnTop = forceOnTop || debugCapsVisible;
    mesh.renderOrder = renderOnTop ? 999 : 20 + idx;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : (mesh.material as THREE.Material);
    if (mat && 'depthTest' in mat) {
      (mat as THREE.Material & { depthTest?: boolean }).depthTest = !renderOnTop;
      (mat as THREE.Material & { depthWrite?: boolean }).depthWrite = false;
      (mat as THREE.Material & { opacity?: number }).opacity = debugCapsVisible ? 0.7 : 0.95;
    }
  });
};

const buildSensorCaps = (boxCenter: THREE.Vector3) => {
  if (sensorPlanes.length !== 6) return;
  const capSize = Math.max(modelMaxDim, sensorBoxSize.x, sensorBoxSize.y, sensorBoxSize.z) * 2.5;
  buildCapsForPlanes(
    sensorPlanes,
    boxCenter,
    capSize,
    sensorCapMeshes,
    sensorStencilGroups,
    () => sensorPlanes,
    false
  );
};

const updateSensorCaps = (boxCenter: THREE.Vector3) => {
  updateCapsForPlanes(sensorPlanes, boxCenter, sensorCapMeshes, false);
};

const buildSensorView = () => {
  if (!renderer || !modelRoot) return;
  if (!sensorBoxInitialized) setSensorBoxToBounds();
  clampSensorBoxToBounds();
  disposeSensorVisuals();

  sensorBoxSize = sensorBoxMax.clone().sub(sensorBoxMin);
  if (sensorBoxSize.lengthSq() === 0) return;

  sensorPlanes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -sensorBoxMin.x));
  sensorPlanes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), sensorBoxMax.x));
  sensorPlanes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -sensorBoxMin.y));
  sensorPlanes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), sensorBoxMax.y));
  sensorPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -sensorBoxMin.z));
  sensorPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), sensorBoxMax.z));

  renderer.clippingPlanes = sensorPlanes;
  enableSensorClipping(sensorPlanes);

  const boxCenter = sensorBoxMin.clone().add(sensorBoxMax).multiplyScalar(0.5);

  sensorBoxHelper = new THREE.Box3Helper(new THREE.Box3(sensorBoxMin.clone(), sensorBoxMax.clone()), 0x22d3ee);
  sensorBoxHelper.frustumCulled = false;
  const helperBypass = createClipBypass(() => sensorPlanes);
  sensorBoxHelper.onBeforeRender = helperBypass.onBeforeRender;
  sensorBoxHelper.onAfterRender = helperBypass.onAfterRender;
  scene.add(sensorBoxHelper);

  const planeDims: [number, number][] = [
    [sensorBoxSize.z, sensorBoxSize.y],
    [sensorBoxSize.z, sensorBoxSize.y],
    [sensorBoxSize.x, sensorBoxSize.z],
    [sensorBoxSize.x, sensorBoxSize.z],
    [sensorBoxSize.x, sensorBoxSize.y],
    [sensorBoxSize.x, sensorBoxSize.y]
  ];
  sensorPlanes.forEach((plane, idx) => {
    const mat = new THREE.MeshBasicMaterial({
      color: sensorPlaneColors[idx % sensorPlaneColors.length],
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      clippingPlanes: []
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeDims[idx][0], planeDims[idx][1]), mat);
    mesh.frustumCulled = false;
    mesh.userData.sensorIndex = idx;
    alignObjectToPlane(mesh, plane, boxCenter);
    mesh.renderOrder = 10 + idx;
    const meshBypass = createClipBypass(() => sensorPlanes);
    mesh.onBeforeRender = meshBypass.onBeforeRender;
    mesh.onAfterRender = meshBypass.onAfterRender;
    sensorPlaneMeshes.push(mesh);
    // Keep the visual plane hidden by default to match floor clipping view.
    mesh.visible = false;
    scene.add(mesh);

    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      clippingPlanes: []
    });
    const hitGeom = new THREE.PlaneGeometry(planeDims[idx][0] * 1.05, planeDims[idx][1] * 1.05);
    const hitMesh = new THREE.Mesh(hitGeom, hitMat);
    hitMesh.frustumCulled = false;
    hitMesh.userData.sensorIndex = idx;
    alignObjectToPlane(hitMesh, plane, boxCenter);
    hitMesh.renderOrder = mesh.renderOrder + 0.01;
    const hitBypass = createClipBypass(() => sensorPlanes);
    hitMesh.onBeforeRender = hitBypass.onBeforeRender;
    hitMesh.onAfterRender = hitBypass.onAfterRender;
    sensorHitMeshes.push(hitMesh);
    scene.add(hitMesh);
  });

  buildSensorCaps(boxCenter);
  const meshes = getModelMeshes();
  meshes.forEach((m) => m.updateMatrixWorld(true));
  applySensorBoxVisibility();
};

const enterSensorsView = () => {
  if (!sensorBoxInitialized) {
    setSensorBoxToBounds();
  }
  disposeCaps(clipCapMeshes, clipStencilGroups);
  sensorBoxVisible.value = true;
  buildSensorView();
};

const exitSensorsView = () => {
  sensorDraggingIndex = null;
  controls.enabled = true;
  disableSensorClipping();
  disposeSensorVisuals();
  sensorBoxVisible.value = true;
  renderer.clippingPlanes = [];
  applyClipping();
};

const updateSensorVisualsFromBox = () => {
  if (!renderer || sensorPlanes.length !== 6 || sensorPlaneMeshes.length !== 6 || !sensorBoxHelper) return;

  sensorBoxSize = sensorBoxMax.clone().sub(sensorBoxMin);
  const boxCenter = sensorBoxMin.clone().add(sensorBoxMax).multiplyScalar(0.5);

  sensorPlanes[0].constant = -sensorBoxMin.x;
  sensorPlanes[1].constant = sensorBoxMax.x;
  sensorPlanes[2].constant = -sensorBoxMin.y;
  sensorPlanes[3].constant = sensorBoxMax.y;
  sensorPlanes[4].constant = -sensorBoxMin.z;
  sensorPlanes[5].constant = sensorBoxMax.z;
  renderer.clippingPlanes = [];
  renderer.clippingPlanes = sensorPlanes;

  sensorBoxHelper.box = new THREE.Box3(sensorBoxMin.clone(), sensorBoxMax.clone());
  sensorBoxHelper.updateMatrixWorld(true);

  const planeDims: [number, number][] = [
    [sensorBoxSize.z, sensorBoxSize.y],
    [sensorBoxSize.z, sensorBoxSize.y],
    [sensorBoxSize.x, sensorBoxSize.z],
    [sensorBoxSize.x, sensorBoxSize.z],
    [sensorBoxSize.x, sensorBoxSize.y],
    [sensorBoxSize.x, sensorBoxSize.y]
  ];

  sensorPlaneMeshes.forEach((mesh, idx) => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(planeDims[idx][0], planeDims[idx][1]);
    alignObjectToPlane(mesh, sensorPlanes[idx], boxCenter);
  });

  sensorHitMeshes.forEach((mesh, idx) => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(planeDims[idx][0] * 1.05, planeDims[idx][1] * 1.05);
    alignObjectToPlane(mesh, sensorPlanes[idx], boxCenter);
  });
  renderer.clippingPlanes = sensorPlanes;
  updateSensorCaps(boxCenter);
  applySensorBoxVisibility();

  if (sensorActiveIndex !== null) {
    updateSensorFaceStyles(sensorActiveIndex, true);
  }
};

const updateSensorFaceStyles = (index: number, active: boolean) => {
  const mesh = sensorPlaneMeshes[index];
  if (!mesh) return;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  const baseColor = sensorPlaneColors[index % sensorPlaneColors.length];
  mat.color.set(active ? 0xef4444 : baseColor);
  mat.opacity = active ? 0.35 : 0.2;
  mat.needsUpdate = true;
};

const handleSensorDragMove = (event: MouseEvent) => {
  if (sensorDraggingIndex === null || mode.value !== 'sensors') return;
  if (!setPointerFromEvent(event)) return;

  raycaster.setFromCamera(pointer, camera);
  const viewPlane = sensorDragViewPlane;
  const hitPoint = new THREE.Vector3();
  if (!viewPlane || !sensorDragStartPoint || !sensorDragStartMin || !sensorDragStartMax) return;
  if (!raycaster.ray.intersectPlane(viewPlane, hitPoint)) return;

  const minGap = Math.max(0.25, modelMaxDim * 0.01);
  const planeNormal = sensorPlanes[sensorDraggingIndex].normal;
  const delta = hitPoint.clone().sub(sensorDragStartPoint);
  const dragSign = planeNormal.x < 0 || planeNormal.y < 0 || planeNormal.z < 0 ? -1 : 1;
  const shift = delta.dot(planeNormal) * dragSign;
  const startMin = sensorDragStartMin;
  const startMax = sensorDragStartMax;

  switch (sensorDraggingIndex) {
    case 0:
      sensorBoxMin.x = Math.min(sensorBoxMax.x - minGap, Math.max(modelBounds.min.x, startMin.x + shift));
      break;
    case 1:
      sensorBoxMax.x = Math.max(sensorBoxMin.x + minGap, Math.min(modelBounds.max.x, startMax.x + shift));
      break;
    case 2:
      sensorBoxMin.y = Math.min(sensorBoxMax.y - minGap, Math.max(modelBounds.min.y, startMin.y + shift));
      break;
    case 3:
      sensorBoxMax.y = Math.max(sensorBoxMin.y + minGap, Math.min(modelBounds.max.y, startMax.y + shift));
      break;
    case 4:
      sensorBoxMin.z = Math.min(sensorBoxMax.z - minGap, Math.max(modelBounds.min.z, startMin.z + shift));
      break;
    case 5:
      sensorBoxMax.z = Math.max(sensorBoxMin.z + minGap, Math.min(modelBounds.max.z, startMax.z + shift));
      break;
  }

  updateSensorVisualsFromBox();
  event.preventDefault();
};

const onCanvasMouseDown = (event: MouseEvent) => {
  if (mode.value !== 'sensors') return;
  if (!setPointerFromEvent(event)) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(sensorHitMeshes, false);
  if (!hits.length) return;
  const hit = hits[0];
  const idx = (hit.object as THREE.Mesh).userData.sensorIndex as number | undefined;
  sensorDraggingIndex = typeof idx === 'number' ? idx : sensorPlaneMeshes.indexOf(hit.object as THREE.Mesh);
  if (sensorActiveIndex !== null && sensorActiveIndex !== sensorDraggingIndex) {
    updateSensorFaceStyles(sensorActiveIndex, false);
  }
  sensorActiveIndex = sensorDraggingIndex;
  updateSensorFaceStyles(sensorDraggingIndex, true);
  const viewNormal = camera.getWorldDirection(new THREE.Vector3()).normalize();
  sensorDragViewPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewNormal, hit.point.clone());
  sensorDragStartPoint = hit.point.clone();
  sensorDragStartMin = sensorBoxMin.clone();
  sensorDragStartMax = sensorBoxMax.clone();
  controls.enabled = false;
  event.preventDefault();
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  controls.update();
  clearStencilIfNeeded();
  renderer.render(scene, camera);
  labelRenderer?.render(scene, camera);
  updateMarkerPositions();
  updateSensorPanelPositions();
};

const onResize = () => {
  const { width, height } = getViewportSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer?.setSize(width, height);
};

const startDrag = (side: 'left' | 'right', event: MouseEvent) => {
  event.preventDefault();
  dragSide.value = side;
};

const stopDrag = () => {
  dragSide.value = null;
  sensorDraggingIndex = null;
  controls.enabled = true;
  if (sensorActiveIndex !== null) {
    updateSensorFaceStyles(sensorActiveIndex, false);
    sensorActiveIndex = null;
  }
  sensorDragViewPlane = null;
  sensorDragStartPoint = null;
  sensorDragStartMin = null;
  sensorDragStartMax = null;
};

const onPointerMove = (event: MouseEvent) => {
  if (sensorDraggingIndex !== null && mode.value === 'sensors') {
    handleSensorDragMove(event);
    return;
  }

  if (!dragSide.value || !layoutRef.value) return;
  const rect = layoutRef.value.getBoundingClientRect();
  const minPanel = 180;
  const minCanvas = 320;
  const resizerSpace = 20;

  if (dragSide.value === 'left') {
    const max = Math.max(minPanel, rect.width - rightPanelWidth.value - resizerSpace - minCanvas);
    const width = Math.min(Math.max(event.clientX - rect.left, minPanel), max);
    leftPanelWidth.value = width;
  } else {
    const max = Math.max(minPanel, rect.width - leftPanelWidth.value - resizerSpace - minCanvas);
    const width = Math.min(Math.max(rect.right - event.clientX, minPanel), max);
    rightPanelWidth.value = width;
  }
  onResize();
};

const onClickCanvas = (event: MouseEvent) => {
  if (mode.value === 'sensors') return;
  closeContextMenu();
  if (!setPointerFromEvent(event)) return;

  raycaster.setFromCamera(pointer, camera);

  const meshHits = raycaster.intersectObjects(Array.from(itemMeshes.values()), false);
  if (meshHits.length) {
    const hit = meshHits[0];
    const itemId = (hit.object as THREE.Mesh).userData.itemId as string | undefined;
    if (itemId) {
      selectItem(itemId);
      return;
    }
  }

  const structureHits = raycaster.intersectObjects(getVisibleStructureMeshes(), false);
  if (structureHits.length) {
    applyStructureSelection(structureHits[0].object as THREE.Mesh);
    return;
  }

  clearStructureSelection();

  if (mode.value !== 'edit') return;

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -modelBaseY);
  const intersection = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, intersection)) return;

  const pos = {
    x: Number(intersection.x.toFixed(2)),
    y: Number(intersection.y.toFixed(2)),
    z: Number(intersection.z.toFixed(2))
  };

  if (selectedItem.value) {
    setItemPosition(selectedItem.value.id, pos);
  } else {
    Object.assign(newItem.position, pos);
  }
};

const onCanvasContextMenu = (event: MouseEvent) => {
  if (mode.value === 'sensors') return;
  closeContextMenu();
  if (!setPointerFromEvent(event)) return;
  raycaster.setFromCamera(pointer, camera);

  const itemHits = raycaster.intersectObjects(Array.from(itemMeshes.values()), false);
  if (itemHits.length) return;

  const structureHits = raycaster.intersectObjects(getVisibleStructureMeshes(), false);
  if (structureHits.length) {
    applyStructureSelection(structureHits[0].object as THREE.Mesh);
  }

  if (!selectedStructureMesh || !selectedStructureId.value) return;
  openContextMenu(event);
  event.preventDefault();
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.defaultPrevented || isTypingTarget(event.target)) return;
  if (mode.value === 'sensors') return;
  const key = event.key.toLowerCase();
  if (key === 'h') {
    if (!selectedStructureIds.size) return;
    hideSelectedStructures();
    event.preventDefault();
    return;
  }
  if (key === 'i') {
    if (!selectedStructureIds.size) return;
    isolateSelectedStructures();
    event.preventDefault();
    return;
  }
  if (key === 'a') {
    showAllStructures();
    event.preventDefault();
  }
};

const toggleSensorBoxVisibility = () => {
  sensorBoxVisible.value = !sensorBoxVisible.value;
  applySensorBoxVisibility();
};

const toggleDebugClipping = () => {
  debugClipping.value = !debugClipping.value;
  refreshClippingVisuals();
};

const clearStencilIfNeeded = () => {
  if (!renderer) return;
  if (clipCapMeshes.length || sensorCapMeshes.length) {
    renderer.clearStencil();
  }
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const isWeatherSensor = (element: StructureElement) => {
  const family = element.FamilyName?.toLowerCase() ?? '';
  const typeName = element.TypeName?.toLowerCase() ?? '';
  return family.includes('esp1') || typeName.includes('esp1') || element.Id === 2546880;
};

const getSensorLabel = (element: StructureElement) => {
  if (element.Id === 2546624) return 'Kitchen ESP32';
  if (isWeatherSensor(element)) return 'Outside Weather';
  return element.TypeName || element.Category || 'Sensor';
};

const isEsp32Sensor = (element: StructureElement) => {
  if (isWeatherSensor(element)) return false;
  const family = element.FamilyName?.toLowerCase() ?? '';
  const typeName = element.TypeName?.toLowerCase() ?? '';
  return family.includes('esp32') || typeName.includes('esp32');
};

const getSensorReadout = (key: string): SensorReadout => {
  const existing = sensorReadings.get(key);
  if (existing) return existing;
  const hash = hashString(key);
  const temperature = 18 + (hash % 90) / 10;
  const humidity = 35 + (hash % 250) / 10;
  const co2 = 420 + (hash % 550);
  const reading = {
    temperature: Number(temperature.toFixed(1)),
    humidity: Number(humidity.toFixed(1)),
    co2
  };
  sensorReadings.set(key, reading);
  return reading;
};

const getWeatherReadout = (key: string): WeatherReadout => {
  const existing = weatherReadings.get(key);
  if (existing) return existing;
  const hash = hashString(`${key}-weather`);
  const temperature = 8 + (hash % 180) / 10;
  const feelsLike = temperature - ((hash % 30) / 10 - 1.5);
  const windSpeed = (hash % 90) / 10;
  const windGust = windSpeed + (hash % 40) / 10;
  const humidity = 35 + (hash % 60);
  const pressure = 1000 + (hash % 45);
  const descriptions = ['Clear', 'Partly Cloudy', 'Overcast', 'Breezy', 'Light Rain'];
  const description = descriptions[hash % descriptions.length];
  const reading = {
    temperature: Number(temperature.toFixed(1)),
    feelsLike: Number(feelsLike.toFixed(1)),
    windSpeed: Number(windSpeed.toFixed(1)),
    windGust: Number(windGust.toFixed(1)),
    description,
    humidity,
    pressure
  };
  weatherReadings.set(key, reading);
  return reading;
};

const parseEsp32Html = (html: string): SensorReadout | null => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('table tr'));
  let temperature: number | undefined;
  let humidity: number | undefined;
  let co2: number | undefined;

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    const label = (cells[0].textContent || '').trim().toLowerCase();
    const rawValue = (cells[1].textContent || '').replace(/[^0-9.+-]/g, ' ').trim();
    const value = Number.parseFloat(rawValue);
    if (Number.isNaN(value)) return;
    if (label.includes('temp') && label.includes('celsius')) {
      temperature = value;
      return;
    }
    if (label.includes('humidity')) {
      humidity = value;
      return;
    }
    if (label.includes('c02') || label.includes('co2')) {
      co2 = value;
    }
  });

  if (temperature === undefined || humidity === undefined || co2 === undefined) return null;
  return { temperature, humidity, co2 };
};

const parseWeatherJson = (data: any): WeatherReadout | null => {
  if (!data || typeof data !== 'object') return null;
  const temp = Number(data?.main?.temp);
  const feelsLike = Number(data?.main?.feels_like);
  const humidity = Number(data?.main?.humidity);
  const pressure = Number(data?.main?.pressure);
  const windSpeed = Number(data?.wind?.speed);
  const windGust = data?.wind?.gust !== undefined ? Number(data.wind.gust) : null;
  const description = typeof data?.weather?.[0]?.description === 'string' ? data.weather[0].description : '';
  if (![temp, feelsLike, humidity, pressure, windSpeed].every(Number.isFinite)) return null;
  return {
    temperature: temp,
    feelsLike,
    windSpeed,
    windGust: Number.isFinite(windGust) ? windGust : null,
    description,
    humidity,
    pressure
  };
};

const formatSensorMetrics = (reading: SensorReadout): SensorMetric[] => [
  { key: 'temp', label: 'Temp', value: `${reading.temperature.toFixed(1)}°C` },
  { key: 'humidity', label: 'Humidity', value: `${reading.humidity.toFixed(1)}%` },
  { key: 'co2', label: 'CO2', value: `${Math.round(reading.co2)} ppm` }
];

const formatWeatherMetrics = (reading: WeatherReadout): SensorMetric[] => {
  const description = reading.description
    ? reading.description.charAt(0).toUpperCase() + reading.description.slice(1)
    : '—';
  return [
    { key: 'outside', label: 'Outside', value: `${reading.temperature.toFixed(1)}°C` },
    { key: 'feels', label: 'Feels Like', value: `${reading.feelsLike.toFixed(1)}°C` },
    { key: 'speed', label: 'Speed', value: `${reading.windSpeed.toFixed(1)} m/s` },
    {
      key: 'gust',
      label: 'Gust',
      value: reading.windGust === null ? '—' : `${reading.windGust.toFixed(1)} m/s`
    },
    { key: 'desc', label: 'Desc', value: description },
    { key: 'humidity', label: 'Humidity', value: `${Math.round(reading.humidity)}%` },
    { key: 'pressure', label: 'Pressure', value: `${Math.round(reading.pressure)} hPa` }
  ];
};

const updateSensorPanelMetrics = (panel: HTMLDivElement, metrics: SensorMetric[]) => {
  metrics.forEach((metric) => {
    const valueEl = panel.querySelector(`[data-metric="${metric.key}"]`) as HTMLElement | null;
    if (valueEl) valueEl.textContent = metric.value;
  });
};

const updateSensorPanelReadout = (panel: HTMLDivElement, reading: SensorReadout) => {
  updateSensorPanelMetrics(panel, formatSensorMetrics(reading));
};

const updateWeatherPanelReadout = (panel: HTMLDivElement, reading: WeatherReadout) => {
  updateSensorPanelMetrics(panel, formatWeatherMetrics(reading));
};

const buildSensorMetrics = (metrics: SensorMetric[], variant: 'default' | 'weather') => {
  const metricsEl = document.createElement('div');
  metricsEl.className = 'sensor-panel__metrics';
  if (variant === 'weather') {
    metricsEl.classList.add('sensor-panel__metrics--weather');
  }
  metrics.forEach((metric) => {
    const metricEl = document.createElement('div');
    metricEl.className = 'sensor-panel__metric';
    const labelEl = document.createElement('span');
    labelEl.textContent = metric.label;
    const valueEl = document.createElement('strong');
    valueEl.dataset.metric = metric.key;
    valueEl.textContent = metric.value;
    metricEl.append(labelEl, valueEl);
    metricsEl.append(metricEl);
  });
  return metricsEl;
};

const updateSensorStatusBadge = (panel: HTMLDivElement, isOnline: boolean) => {
  const statusEl = panel.querySelector('[data-status="sensor"]') as HTMLElement | null;
  if (!statusEl) return;
  statusEl.classList.toggle('sensor-panel__status--online', isOnline);
  statusEl.classList.toggle('sensor-panel__status--offline', !isOnline);
};

const applyEsp32ReadingsToLabels = () => {
  const reading = esp32Reading.value;
  if (!reading) return;
  const online = !!esp32Online.value;
  sensorLabels.forEach((label, key) => {
    const element = structureElements.get(key);
    if (!element || !isEsp32Sensor(element)) return;
    const panel = label.element as HTMLDivElement;
    updateSensorPanelReadout(panel, reading);
    updateSensorStatusBadge(panel, online);
  });
};

const applyWeatherReadingsToLabels = () => {
  const reading = weatherReading.value;
  if (!reading) return;
  const online = !!weatherOnline.value;
  sensorLabels.forEach((label, key) => {
    const element = structureElements.get(key);
    if (!element || !isWeatherSensor(element)) return;
    const panel = label.element as HTMLDivElement;
    updateWeatherPanelReadout(panel, reading);
    updateSensorStatusBadge(panel, online);
  });
};

const fetchEsp32Readings = async () => {
  if (esp32FetchInFlight) return;
  esp32FetchInFlight = true;
  const sources = ['https://pi.deyan.uk/esp32', '/models/esp32.htm'];
  let success = false;
  try {
    for (const source of sources) {
      try {
        const response = await fetch(source, { cache: 'no-store' });
        if (!response.ok) continue;
        const html = await response.text();
        const parsed = parseEsp32Html(html);
        if (!parsed) continue;
        esp32Reading.value = parsed;
        success = true;
        break;
      } catch (err) {
        console.warn(`Failed to fetch ESP32 data from ${source}`, err);
      }
    }
    esp32Online.value = success;
    if (success) {
      applyEsp32ReadingsToLabels();
    } else {
      sensorLabels.forEach((label, key) => {
        const element = structureElements.get(key);
        if (!element || !isEsp32Sensor(element)) return;
        updateSensorStatusBadge(label.element as HTMLDivElement, false);
      });
    }
  } finally {
    esp32FetchInFlight = false;
  }
};

const fetchWeatherReadings = async () => {
  if (weatherFetchInFlight) return;
  weatherFetchInFlight = true;
  try {
    const apiKey = runtimeConfig.public.openWeatherMapApiKey as string | undefined;
    if (!apiKey) {
      throw new Error('OpenWeatherMap API key missing');
    }
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.search = new URLSearchParams({
      lat: '51.60415',
      lon: '-0.0045088',
      appid: apiKey,
      units: 'metric'
    }).toString();
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Weather fetch failed (${response.status})`);
    }
    const data = await response.json();
    const parsed = parseWeatherJson(data);
    if (!parsed) {
      throw new Error('Weather payload missing expected fields');
    }
    weatherReading.value = parsed;
    weatherOnline.value = true;
    applyWeatherReadingsToLabels();
  } catch (err) {
    console.warn('Failed to fetch weather data', err);
    weatherOnline.value = false;
    sensorLabels.forEach((label, key) => {
      const element = structureElements.get(key);
      if (!element || !isWeatherSensor(element)) return;
      updateSensorStatusBadge(label.element as HTMLDivElement, false);
    });
  } finally {
    weatherFetchInFlight = false;
  }
};

const updateEsp32Polling = () => {
  const hasEsp32 = structureElementList.value.some(isEsp32Sensor);
  if (!hasEsp32) {
    if (esp32PollTimer !== null) {
      window.clearInterval(esp32PollTimer);
      esp32PollTimer = null;
    }
    return;
  }
  if (esp32PollTimer === null) {
    void fetchEsp32Readings();
    esp32PollTimer = window.setInterval(() => {
      void fetchEsp32Readings();
    }, 15000);
  }
};

const updateWeatherPolling = () => {
  const hasWeather = structureElementList.value.some(isWeatherSensor);
  if (!hasWeather) {
    if (weatherPollTimer !== null) {
      window.clearInterval(weatherPollTimer);
      weatherPollTimer = null;
    }
    return;
  }
  if (weatherPollTimer === null) {
    void fetchWeatherReadings();
    weatherPollTimer = window.setInterval(() => {
      void fetchWeatherReadings();
    }, 60000);
  }
};

const clearSensorLabels = () => {
  sensorLabels.forEach((label) => {
    label.removeFromParent();
  });
  sensorLabels.clear();
};

const refreshSensorOverlay = () => {
  clearSensorLabels();
  if (!labelRenderer) return;

  const sensors = structureElementList.value.filter((element) => element.ModelLayer === 'sensors');
  sensors.forEach((element) => {
    const key = getElementKey(element);
    const mesh = structureMeshes.get(key);
    if (!mesh) return;

    const label = getSensorLabel(element);
    const isWeather = isWeatherSensor(element);
    const isEsp32 = isEsp32Sensor(element);
    const panel = document.createElement('div');
    panel.className = isWeather ? 'sensor-panel sensor-panel--weather' : 'sensor-panel';
    panel.dataset.key = key;

    const titleRow = document.createElement('div');
    titleRow.className = 'sensor-panel__title-row';
    const statusDot = document.createElement('span');
    statusDot.dataset.status = 'sensor';
    const isOnline = isWeather
      ? !!weatherOnline.value
      : isEsp32
        ? !!esp32Online.value
        : true;
    statusDot.className = `sensor-panel__status ${
      isOnline ? 'sensor-panel__status--online' : 'sensor-panel__status--offline'
    }`;
    const title = document.createElement('span');
    title.className = 'sensor-panel__title';
    title.textContent = label;
    titleRow.append(statusDot, title);

    const sensorMetrics = isWeather
      ? formatWeatherMetrics(weatherReading.value ?? getWeatherReadout(key))
      : formatSensorMetrics(
          isEsp32 && esp32Reading.value ? esp32Reading.value : getSensorReadout(key)
        );
    const metricsEl = buildSensorMetrics(sensorMetrics, isWeather ? 'weather' : 'default');
    panel.append(titleRow, metricsEl);

    const labelObject = new CSS2DObject(panel);
    const geometry = mesh.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const topY = box ? box.max.y : center.y;
    labelObject.position.set(center.x, topY, center.z);
    mesh.add(labelObject);
    sensorLabels.set(key, labelObject);
  });
  updateEsp32Polling();
  updateWeatherPolling();
  applyEsp32ReadingsToLabels();
  applyWeatherReadingsToLabels();
};

const syncOverlayLayerBounds = (layer: HTMLDivElement | null) => {
  if (!layer || !renderer || !overlay.value) return null;
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  if (!width || !height) return null;
  overlay.value.style.left = '0px';
  overlay.value.style.top = '0px';
  overlay.value.style.width = `${width}px`;
  overlay.value.style.height = `${height}px`;
  layer.style.left = '0px';
  layer.style.top = '0px';
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
  return { width, height };
};

const updateSensorPanelPositions = () => {
  if (!labelRenderer) return;
  const isVisible = !!modelVisibility.sensors;
  labelRenderer.domElement.style.display = isVisible ? 'block' : 'none';
  sensorLabels.forEach((label) => {
    const mesh = label.parent as THREE.Object3D | null;
    if (!mesh) return;
    label.visible = isVisible && mesh.visible;
  });
};

const refreshMarkerOverlay = () => {
  if (!markerLayer.value) return;
  markerLayer.value.innerHTML = '';
  markers.clear();

  items.value.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'marker';
    const label = document.createElement('span');
    label.textContent = item.name;
    el.appendChild(label);
    el.addEventListener('click', () => selectItem(item.id));
    markerLayer.value?.appendChild(el);
    markers.set(item.id, el);
    if (selectedItemId.value === item.id) {
      el.classList.add('marker--active');
    }
  });
};

const updateMarkerPositions = () => {
  if (!markerLayer.value) return;
  const bounds = syncOverlayLayerBounds(markerLayer.value);
  if (!bounds) return;
  const { width, height } = bounds;
  items.value.forEach((item) => {
    const marker = markers.get(item.id);
    if (!marker) return;

    const vector = new THREE.Vector3(item.position.x, item.position.y, item.position.z);
    vector.project(camera);
    const x = (vector.x * 0.5 + 0.5) * width;
    const y = (-vector.y * 0.5 + 0.5) * height;

    marker.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    marker.style.opacity = vector.z > 1 ? '0' : '1';
  });
};

const setItemPosition = (itemId: string, position: { x: number; y: number; z: number }) => {
  const idx = items.value.findIndex((i) => i.id === itemId);
  if (idx !== -1) {
    items.value[idx] = { ...items.value[idx], position };
  }
  if (selectedItem.value?.id === itemId) {
    Object.assign(editItem.position, position);
  }
  const mesh = itemMeshes.get(itemId);
  if (mesh) {
    mesh.position.set(position.x, position.y, position.z);
  }
  updateMarkerPositions();
};

const createLabelTexture = (text: string) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#0b1221';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

const disposeStencilGroupsForMesh = (
  mesh: THREE.Mesh,
  groups: { parent: THREE.Object3D; group: THREE.Group }[]
) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const record = groups[i];
    if (record.parent === mesh) {
      record.parent.remove(record.group);
      record.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const cMesh = child as THREE.Mesh;
          cMesh.geometry.dispose();
          const mats = Array.isArray(cMesh.material) ? cMesh.material : [cMesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
      groups.splice(i, 1);
    }
  }
};

const disposeMesh = (mesh: THREE.Mesh) => {
  disposeStencilGroupsForMesh(mesh, sensorStencilGroups);
  disposeStencilGroupsForMesh(mesh, clipStencilGroups);

  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    const materialWithMap = mat as THREE.Material & { map?: THREE.Texture | null };
    if (materialWithMap.map) materialWithMap.map.dispose();
    sensorClippedMaterials.delete(mat);
    mat.dispose();
  });
};

const clearItemMeshes = () => {
  itemMeshes.forEach((mesh) => {
    scene.remove(mesh);
    disposeMesh(mesh);
  });
  itemMeshes.clear();
};

const createItemMesh = (item: ItemRecord) => {
  // Replace existing mesh if it exists to keep data in sync.
  const existing = itemMeshes.get(item.id);
  if (existing) {
    scene.remove(existing);
    disposeMesh(existing);
    itemMeshes.delete(item.id);
  }

  const size = computeItemSize();
  const geometry = new THREE.BoxGeometry(size, size, size);
  const labelTexture = createLabelTexture(item.name || 'Item');

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: '#1f2937',
    roughness: 0.6,
    metalness: 0.1
  });
  const labelMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture,
    color: '#ffffff',
    roughness: 0.45,
    metalness: 0.1
  });

  // Apply the label to one face; others remain base material.
  const materials = [
    baseMaterial,
    baseMaterial,
    baseMaterial,
    baseMaterial,
    labelMaterial,
    baseMaterial
  ];

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(item.position.x, item.position.y, item.position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.itemId = item.id;

  if (mode.value === 'sensors' && sensorPlanes.length === 6) {
    applyClippingToMeshMaterials(mesh, sensorPlanes);
  }

  scene.add(mesh);
  itemMeshes.set(item.id, mesh);
  updateSceneBounds();
};

const syncItemMeshes = () => {
  clearItemMeshes();
  items.value.forEach(createItemMesh);
};

onMounted(async () => {
  initThree();
  applyClipping();
  await loadStructureModel();
  await fetchItems();
  animate();
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('click', closeContextMenu);
  renderer.domElement.addEventListener('click', onClickCanvas);
  renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
  renderer.domElement.addEventListener('contextmenu', onCanvasContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', onPointerMove);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('click', closeContextMenu);
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  renderer?.domElement?.removeEventListener('click', onClickCanvas);
  renderer?.domElement?.removeEventListener('mousedown', onCanvasMouseDown);
  renderer?.domElement?.removeEventListener('contextmenu', onCanvasContextMenu);
  clearStructureMeshes();
  clearItemMeshes();
  disableSensorClipping();
  disposeSensorVisuals();
  disposeCaps(clipCapMeshes, clipStencilGroups);
  clearSensorLabels();
  renderer?.dispose();
  controls?.dispose();
  if (esp32PollTimer !== null) {
    window.clearInterval(esp32PollTimer);
    esp32PollTimer = null;
  }
  if (weatherPollTimer !== null) {
    window.clearInterval(weatherPollTimer);
    weatherPollTimer = null;
  }
  if (labelRenderer) {
    labelRenderer.domElement.remove();
    labelRenderer = null;
  }
  if (elementsPopup && !elementsPopup.closed) {
    elementsPopup.close();
  }
  elementsPopup = null;
  elementsPopupOpen.value = false;
});

watch(
  () => mode.value,
  (next, prev) => {
    if (next === 'sensors') {
      enterSensorsView();
      return;
    }

    if (prev === 'sensors') {
      exitSensorsView();
    }
    applyClipping();
  }
);

watch(
  () => selectedItem.value,
  (item) => {
    mutationError.value = '';
    if (!item) {
      resetEditItem();
      updateMarkerStyles();
      return;
    }
    Object.assign(editItem, {
      id: item.id,
      name: item.name,
      description: item.description,
      url: item.url,
      dateAdded: item.dateAdded,
      rooms: item.rooms.join(', '),
      position: { ...item.position }
    });
    updateMarkerStyles();
  }
);

watch(
  () => selectedElementRecord.value,
  (record) => {
    elementMutationError.value = '';
    if (!record) {
      resetElementMeta();
      return;
    }
    Object.assign(elementMetaForm, {
      yearAdded: record.yearAdded || '',
      softwareOriginator: record.softwareOriginator || '',
      comment: record.comment || ''
    });
  }
);

watch(
  () => debugClipping.value,
  () => {
    refreshClippingVisuals();
    applySensorBoxVisibility();
  }
);

watch(
  () => capColorMode.value,
  () => {
    refreshClippingVisuals();
  }
);

watch(
  lightSettings,
  () => {
    applyLightSettings();
  },
  { deep: true }
);

watch(appTheme, () => {
  syncElementsPopupTheme();
});

watch(structureElementList, () => {
  renderElementsPopup();
  refreshSensorOverlay();
});

watch(elementTableSearch, () => {
  renderElementsPopup();
});

watch(filteredStructureElements, () => {
  renderElementsPopup();
});

watch(materialSearch, () => {
  renderElementsPopup();
});

watch(materialCatalog, () => {
  renderElementsPopup();
});

watch(filteredMaterialCatalog, () => {
  renderElementsPopup();
});

watch(elementsPanelTab, () => {
  renderElementsPopup();
  if (showElementsTable.value && elementsPanelTab.value === 'elements') {
    nextTick(() => scrollSelectedElementRow());
  }
});

watch(showElementsTable, (isOpen) => {
  if (isOpen && elementsPanelTab.value === 'elements') {
    nextTick(() => scrollSelectedElementRow());
  }
});

watch(
  () => selectedStructureId.value,
  () => {
    syncElementsPopupSelection();
    if (showElementsTable.value && elementsPanelTab.value === 'elements') {
      nextTick(() => scrollSelectedElementRow());
    }
  }
);

watch(
  () => selectedStructureIds.size,
  () => {
    syncElementsPopupSelection();
  }
);

watch(
  () => clipCapMeshes.length,
  () => {
    // Keep stencil fresh when caps are present.
    clearStencilIfNeeded();
  }
);
</script>

<template>
  <div ref="layoutRef" class="viewer-layout">
    <aside class="panel" :style="{ width: `${leftPanelWidth}px`, flexBasis: `${leftPanelWidth}px` }">
      <section class="panel-block">
        <p class="label">Mode</p>
        <div class="row">
          <button :class="['chip', mode === 'view' && 'chip--active']" @click="mode = 'view'">Viewer</button>
          <button :class="['chip', mode === 'edit' && 'chip--active']" @click="mode = 'edit'">Editor</button>
        </div>
        <button
          :class="['chip', 'chip--wide', mode === 'sensors' && 'chip--active']"
          @click="mode = 'sensors'"
        >
          Sensors Data
        </button>
      </section>

      <section v-if="mode === 'sensors'" class="panel-block">
        <p class="label">Sensors box</p>
        <p class="muted small">Click and drag any face of the visible box to resize the clipping volume.</p>
        <button class="pill" @click="toggleSensorBoxVisibility">
          {{ sensorBoxVisible ? 'Hide' : 'Show' }} clipping box
        </button>
      </section>

      <section class="panel-block">
        <p class="label">Debug</p>
        <p class="muted tiny">
          Shows clip plane helpers and cap counts. When enabled, caps are forced visible (orange) even if stencil fails.
        </p>
        <div class="row">
          <button class="pill" @click="capColorMode = 'gray'" :disabled="capColorMode === 'gray'">
            Gray caps
          </button>
          <button class="pill" @click="capColorMode = 'match'" :disabled="capColorMode === 'match'">
            Match model color
          </button>
        </div>
        <button class="pill" @click="toggleDebugClipping">
          {{ debugClipping ? 'Disable' : 'Enable' }} clipping debug
        </button>
        <div v-if="debugClipping" class="debug-readout">
          <p class="tiny muted">Planes: {{ clipDebugInfo.planes.length }} | Caps: {{ clipDebugInfo.caps }}</p>
          <div class="debug-planes">
            <p
              v-for="(p, idx) in clipDebugInfo.planes"
              :key="idx"
              class="tiny"
            >
              #{{ idx + 1 }} n=({{ p.normal.x.toFixed(2) }}, {{ p.normal.y.toFixed(2) }}, {{ p.normal.z.toFixed(2) }}) c={{ p.constant.toFixed(2) }}
            </p>
          </div>
        </div>
      </section>

      <section class="panel-block">
        <p class="label">Floors</p>
        <div class="column gap">
          <button
            v-for="floor in ['all','ground','first','second']"
            :key="floor"
            :disabled="mode === 'sensors'"
            :class="['pill', selectedFloor === floor && 'pill--active']"
            @click="setFloor(floor as any)"
          >
            {{
              floor === 'all'
                ? 'House 3D View'
                : floor === 'ground'
                  ? 'Ground floor'
                  : floor === 'first'
                    ? 'First floor'
                    : 'Second floor'
            }}
          </button>
        </div>
      </section>

      <section class="panel-block items-block">
        <div class="label-row">
          <p class="label">Items</p>
          <p v-if="itemsLoading" class="tiny muted">Loading...</p>
        </div>
        <p v-if="itemsError" class="notice notice--error">{{ itemsError }}</p>
        <div class="items-list">
          <div v-if="itemsLoading" class="muted small">Loading items...</div>
          <div v-else-if="!items.length" class="muted">No items yet.</div>
          <template v-else>
            <article
              v-for="item in items"
              :key="item.id"
              :class="['item-card', selectedItemId === item.id && 'item-card--active']"
              @click="selectItem(item.id)"
            >
              <p class="strong">{{ item.name }}</p>
              <p class="muted small">{{ item.rooms.join(', ') }}</p>
              <p class="muted small">{{ item.description }}</p>
              <p class="muted small">Added: {{ item.dateAdded }}</p>
              <p class="tiny muted">Pos: {{ item.position.x }}, {{ item.position.y }}, {{ item.position.z }}</p>
              <a v-if="item.url" :href="item.url" target="_blank" class="link">Link</a>
            </article>
          </template>
        </div>
      </section>

      <section v-if="mode === 'edit'" class="panel-block form-card">
        <p class="strong">Add item</p>
        <p v-if="mutationError" class="notice notice--error">{{ mutationError }}</p>
        <input v-model="newItem.name" class="input" placeholder="Name" />
        <textarea v-model="newItem.description" class="input" rows="2" placeholder="Description"></textarea>
        <input v-model="newItem.url" class="input" placeholder="Web URL" />
        <input v-model="newItem.dateAdded" type="date" class="input" />
        <input v-model="newItem.rooms" class="input" placeholder="Rooms (comma separated)" />

        <div class="coords">
          <label>X
            <input v-model.number="newItem.position.x" type="number" step="0.1" class="input" />
          </label>
          <label>Y
            <input v-model.number="newItem.position.y" type="number" step="0.1" class="input" />
          </label>
          <label>Z
            <input v-model.number="newItem.position.z" type="number" step="0.1" class="input" />
          </label>
        </div>
        <p class="tiny muted">Tip: click on the model to prefill position.</p>

        <button @click="submitItem" class="primary" :disabled="mutationLoading || !newItem.name.trim()">
          {{ mutationLoading ? 'Saving...' : 'Save item' }}
        </button>
      </section>
    </aside>

    <div class="resizer" @mousedown="startDrag('left', $event)"></div>

    <div ref="canvasWrap" class="canvas-wrap">
      <div ref="container" class="viewer">
        <div ref="overlay" class="overlay">
          <div ref="markerLayer" class="overlay-layer overlay-layer--markers"></div>
        </div>
      </div>
      <div class="canvas-tools">
        <button
          type="button"
          class="canvas-bg-toggle"
          :aria-label="canvasBackground === 'light' ? 'Switch canvas to black' : 'Switch canvas to white'"
          :title="canvasBackground === 'light' ? 'Switch canvas to black' : 'Switch canvas to white'"
          @click="toggleCanvasBackground"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2" />
            <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="4.6" y1="4.6" x2="6.7" y2="6.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="17.3" y1="17.3" x2="19.4" y2="19.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="17.3" y1="6.7" x2="19.4" y2="4.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="4.6" y1="19.4" x2="6.7" y2="17.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="canvas-settings-toggle"
          :aria-label="showCanvasSettings ? 'Close canvas settings' : 'Open canvas settings'"
          :title="showCanvasSettings ? 'Close canvas settings' : 'Open canvas settings'"
          @click="showCanvasSettings = !showCanvasSettings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2" />
            <path
              d="M19.4 15a7.9 7.9 0 0 0 .1-1l2-1.2-2-3.4-2.3.7a8 8 0 0 0-1.6-.9L15 6h-4l-.6 2.2a8 8 0 0 0-1.6.9L6.5 8.4l-2 3.4 2 1.2a7.9 7.9 0 0 0 .1 1l-2 1.2 2 3.4 2.3-.7a8 8 0 0 0 1.6.9L11 22h4l.6-2.2a8 8 0 0 0 1.6-.9l2.3.7 2-3.4-2-1.2z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div class="canvas-tools-right">
        <button
          type="button"
          class="canvas-table-toggle"
          :aria-label="isElementsPanelOpen ? 'Close elements table' : 'Open elements table'"
          :title="isElementsPanelOpen ? 'Close elements table' : 'Open elements table'"
          @click="toggleElementsPopup"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2" />
            <line x1="9" y1="10" x2="9" y2="19" stroke="currentColor" stroke-width="2" />
            <line x1="15" y1="10" x2="15" y2="19" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
      <div v-if="showCanvasSettings" class="canvas-settings">
        <div class="settings-header">
          <p class="strong">Settings</p>
          <button type="button" class="settings-close" @click="showCanvasSettings = false">×</button>
        </div>
        <div class="settings-group">
          <p class="label">Hemisphere light</p>
          <div class="settings-row">
            <span class="settings-label">Intensity</span>
            <input
              v-model.number="lightSettings.hemi.intensity"
              type="range"
              min="0"
              max="2"
              step="0.05"
            />
            <span class="settings-value">{{ lightSettings.hemi.intensity.toFixed(2) }}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Sky</span>
            <input v-model="lightSettings.hemi.color" type="color" />
          </div>
          <div class="settings-row">
            <span class="settings-label">Ground</span>
            <input v-model="lightSettings.hemi.groundColor" type="color" />
          </div>
        </div>
        <div class="settings-group">
          <p class="label">Ambient light</p>
          <div class="settings-row">
            <span class="settings-label">Intensity</span>
            <input
              v-model.number="lightSettings.ambient.intensity"
              type="range"
              min="0"
              max="2"
              step="0.05"
            />
            <span class="settings-value">{{ lightSettings.ambient.intensity.toFixed(2) }}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Color</span>
            <input v-model="lightSettings.ambient.color" type="color" />
          </div>
        </div>
        <div class="settings-group">
          <p class="label">Directional light</p>
          <div class="settings-row">
            <span class="settings-label">Intensity</span>
            <input
              v-model.number="lightSettings.directional.intensity"
              type="range"
              min="0"
              max="2"
              step="0.05"
            />
            <span class="settings-value">{{ lightSettings.directional.intensity.toFixed(2) }}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Color</span>
            <input v-model="lightSettings.directional.color" type="color" />
          </div>
        </div>
      </div>
      <div v-if="showElementsTable && !elementsPopupOpen" class="canvas-elements-panel">
        <div class="settings-header">
          <span></span>
          <button type="button" class="settings-close" @click="showElementsTable = false">×</button>
        </div>
        <div class="elements-tabs">
          <button
            type="button"
            :class="['elements-tab', elementsPanelTab === 'elements' && 'elements-tab--active']"
            @click="elementsPanelTab = 'elements'"
          >
            Elements
          </button>
          <button
            type="button"
            :class="['elements-tab', elementsPanelTab === 'materials' && 'elements-tab--active']"
            @click="elementsPanelTab = 'materials'"
          >
            Materials
          </button>
        </div>
        <div v-if="elementsPanelTab === 'elements'" class="elements-pane">
          <div class="elements-toolbar">
            <input
              v-model="elementTableSearch"
              type="search"
              class="input input--dense"
              placeholder="Search elements..."
              aria-label="Search elements"
            />
            <span class="muted tiny">
              {{ filteredStructureElements.length }} / {{ structureElementList.length }}
            </span>
          </div>
          <div v-if="structureElementList.length === 0" class="muted small">No elements loaded.</div>
          <div v-else ref="elementsTableWrap" class="elements-table-wrap">
            <div v-if="filteredStructureElements.length === 0" class="muted small elements-empty">
              No matches for "{{ elementTableSearch }}".
            </div>
            <table v-else class="elements-table">
              <thead>
              <tr>
                <th scope="col">Element</th>
                <th scope="col">Type</th>
                <th scope="col">Material</th>
                <th scope="col">Model</th>
                <th scope="col">Year added</th>
                <th scope="col">Software</th>
                <th scope="col">Comment</th>
              </tr>
              </thead>
              <tbody>
                <tr
                  v-for="element in filteredStructureElements"
                  :key="getElementKey(element)"
                  :class="[
                    'elements-row',
                    selectedStructureIds.has(getElementKey(element)) && 'elements-row--active'
                  ]"
                  @click="selectStructureFromTable(element)"
                  @contextmenu.prevent="openElementsContextMenu($event, element)"
                >
                  <td class="elements-cell">{{ element.Category || '-' }}</td>
                  <td class="elements-cell">{{ element.TypeName || '-' }}</td>
                  <td class="elements-cell">{{ getElementMaterialNames(element).join(', ') || '-' }}</td>
                  <td class="elements-cell">{{ getModelLayerLabel(element.ModelLayer) }}</td>
                  <td class="elements-cell">
                    <input
                      v-if="isEditor"
                      class="elements-input"
                      type="text"
                      :value="getElementDraftForElement(element)?.yearAdded || ''"
                      @click.stop
                      @input="updateElementDraft(element, 'yearAdded', ($event.target as HTMLInputElement).value)"
                      @blur="saveElementDraft(element)"
                    />
                    <span v-else>{{ getElementRecordForElement(element)?.yearAdded || '-' }}</span>
                  </td>
                  <td class="elements-cell">
                    <input
                      v-if="isEditor"
                      class="elements-input"
                      type="text"
                      :value="getElementDraftForElement(element)?.softwareOriginator || ''"
                      @click.stop
                      @input="updateElementDraft(element, 'softwareOriginator', ($event.target as HTMLInputElement).value)"
                      @blur="saveElementDraft(element)"
                    />
                    <span v-else>{{ getElementRecordForElement(element)?.softwareOriginator || '-' }}</span>
                  </td>
                  <td class="elements-cell">
                    <input
                      v-if="isEditor"
                      class="elements-input"
                      type="text"
                      :value="getElementDraftForElement(element)?.comment || ''"
                      @click.stop
                      @input="updateElementDraft(element, 'comment', ($event.target as HTMLInputElement).value)"
                      @blur="saveElementDraft(element)"
                    />
                    <span v-else>{{ getElementRecordForElement(element)?.comment || '-' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="elements-pane">
          <div class="materials-toolbar">
            <input
              v-model="materialSearch"
              type="search"
              class="input input--dense"
              placeholder="Search materials..."
              aria-label="Search materials"
            />
            <span class="muted tiny">{{ filteredMaterialCatalog.length }} / {{ materialCatalog.length }}</span>
          </div>
          <div v-if="materialCatalog.length === 0" class="muted small">No materials loaded.</div>
          <div v-else class="materials-table-wrap">
            <div v-if="filteredMaterialCatalog.length === 0" class="muted small materials-empty">
              No matches for "{{ materialSearch }}".
            </div>
            <table v-else class="materials-table">
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th scope="col">Color</th>
                  <th scope="col">Transparency</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="material in filteredMaterialCatalog" :key="getMaterialKey(material)">
                  <td class="material-cell material-cell--name">
                    <span class="strong material-name">{{ material.Name }}</span>
                  </td>
                  <td class="material-cell">
                    <div class="material-color">
                      <input
                        type="color"
                        class="color-input"
                        :value="getMaterialColorHex(material)"
                        @input="onMaterialColorInput(material, $event)"
                        aria-label="Material color"
                      />
                      <span class="muted tiny">{{ getMaterialColorHex(material) }}</span>
                    </div>
                  </td>
                  <td class="material-cell">
                    <div class="material-transparency">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        :value="material.Transparency ?? 0"
                        @input="onMaterialTransparencyInput(material, $event)"
                        aria-label="Material transparency"
                      />
                      <div class="transparency-input">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          class="input input--tiny"
                          :value="material.Transparency ?? 0"
                          @input="onMaterialTransparencyInput(material, $event)"
                          aria-label="Material transparency percentage"
                        />
                        <span class="muted tiny">%</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div
        v-if="contextMenuOpen"
        class="context-menu"
        :style="{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }"
        @click.stop
      >
        <button type="button" class="context-menu__item" @click="selectSimilarFromModelContextMenu">
          Select similar
        </button>
        <button type="button" class="context-menu__item" @click="isolateSelectedStructures">
          Isolate selected
        </button>
        <button type="button" class="context-menu__item" @click="hideSelectedStructures">
          Hide selected
        </button>
        <button type="button" class="context-menu__item" @click="showAllStructures">Show all</button>
      </div>
      <div
        v-if="elementsContextMenuOpen"
        class="context-menu"
        :style="{ left: `${elementsContextMenuPos.x}px`, top: `${elementsContextMenuPos.y}px` }"
        @click.stop
      >
        <button type="button" class="context-menu__item" @click="selectSimilarFromContextMenu">
          Select similar
        </button>
        <button type="button" class="context-menu__item" @click="isolateSelectedStructures">
          Isolate selected
        </button>
        <button type="button" class="context-menu__item" @click="hideSelectedStructures">
          Hide selected
        </button>
        <button type="button" class="context-menu__item" @click="showAllStructures">
          Show all
        </button>
      </div>
      <div v-if="loadingModel" class="loading">Loading model...</div>
      <div v-if="modelError" class="error">{{ modelError }}</div>
    </div>

    <div class="resizer" @mousedown="startDrag('right', $event)"></div>

    <aside class="detail-panel" :style="{ width: `${rightPanelWidth}px`, flexBasis: `${rightPanelWidth}px` }">
      <div class="tab-row">
        <button
          class="tab-btn"
          :class="rightPanelTab === 'models' && 'tab-btn--active'"
          @click="rightPanelTab = 'models'"
        >
          Models
        </button>
        <button
          class="tab-btn"
          :class="rightPanelTab === 'selection' && 'tab-btn--active'"
          @click="rightPanelTab = 'selection'"
        >
          Selection
        </button>
      </div>

      <section v-if="rightPanelTab === 'models'" class="panel-block">
        <p class="label">Models</p>
        <div class="column gap">
          <button
            v-for="layer in modelLayers"
            :key="layer.id"
            :class="['pill', 'pill--toggle', modelVisibility[layer.id] && 'pill--active']"
            @click="toggleModelVisibility(layer.id)"
          >
            <span>{{ layer.label }}</span>
            <span class="pill-state">{{ modelVisibility[layer.id] ? 'Visible' : 'Hidden' }}</span>
          </button>
        </div>
      </section>

      <div v-else class="panel-stack">
        <section class="panel-block">
          <p class="label">Selected element</p>
          <div v-if="!selectedStructure" class="muted small">Click a structure element in the model.</div>
          <div v-else class="element-card">
            <p class="strong">{{ selectedStructure.Category || 'Element' }}</p>
            <p class="muted small">Type: {{ selectedStructure.TypeName || 'Unspecified' }}</p>
            <p class="muted small">Family: {{ selectedStructure.FamilyName || 'Unspecified' }}</p>
          <div v-if="selectedStructureMaterials.length" class="material-preview-list">
            <div
              v-for="(material, idx) in selectedStructureMaterials"
              :key="`${material.name}-${idx}`"
              class="material-preview"
            >
              <span
                v-if="material.swatch"
                class="material-swatch"
                :style="{ backgroundColor: material.swatch }"
              ></span>
              <div class="material-info">
                <p class="muted small">
                  Material: {{ material.name }}
                  <span v-if="material.primary" class="muted tiny"> (primary)</span>
                  <span v-if="!material.matched" class="muted tiny"> (unmapped)</span>
                </p>
                <p v-if="material.transparency !== null" class="muted tiny">
                  Transparency: {{ material.transparency }}%
                </p>
              </div>
            </div>
          </div>
          <p v-else class="muted small">Materials: Unspecified</p>
            <p class="muted tiny">Id: {{ selectedStructure.Id }}</p>
          </div>
        </section>

        <section class="panel-block">
          <p class="label">Element metadata</p>
          <p v-if="elementsLoading" class="muted tiny">Syncing element metadata...</p>
          <p v-if="elementsError" class="notice notice--error">{{ elementsError }}</p>
          <p v-if="elementMutationError && selectedStructure" class="notice notice--error">
            {{ elementMutationError }}
          </p>
          <div v-if="!selectedStructure" class="muted small">Select an element to add notes.</div>
          <div v-else class="detail-form">
            <input v-model="elementMetaForm.yearAdded" class="input" placeholder="Year added" />
            <input
              v-model="elementMetaForm.softwareOriginator"
              class="input"
              placeholder="Software originator"
            />
            <textarea v-model="elementMetaForm.comment" class="input" rows="3" placeholder="Comment"></textarea>
            <div class="row">
              <button
                class="primary"
                @click="saveSelectedElementMeta"
                :disabled="elementMutationLoading || !selectedElementRecord"
              >
                {{ elementMutationLoading ? 'Saving...' : 'Save notes' }}
              </button>
            </div>
          </div>
        </section>

        <section class="panel-block">
          <p class="label">Selected item</p>
          <p v-if="mutationError && mode === 'edit'" class="notice notice--error">{{ mutationError }}</p>
          <div v-if="!selectedItem" class="muted small">Pick an item from the list or markers.</div>

          <div v-else class="detail-form">
            <input v-model="editItem.name" class="input" placeholder="Name" />
            <textarea v-model="editItem.description" class="input" rows="2" placeholder="Description"></textarea>
            <input v-model="editItem.url" class="input" placeholder="Web URL" />
            <input v-model="editItem.dateAdded" type="date" class="input" />
            <input v-model="editItem.rooms" class="input" placeholder="Rooms (comma separated)" />

            <div class="coords">
              <label>X
                <input v-model.number="editItem.position.x" type="number" step="0.1" class="input" />
              </label>
              <label>Y
                <input v-model.number="editItem.position.y" type="number" step="0.1" class="input" />
              </label>
              <label>Z
                <input v-model.number="editItem.position.z" type="number" step="0.1" class="input" />
              </label>
            </div>
            <div class="row">
              <button class="primary" @click="updateSelectedItem" :disabled="mutationLoading">
                {{ mutationLoading ? 'Saving...' : 'Save changes' }}
              </button>
              <button class="danger" @click="deleteSelectedItem" :disabled="mutationLoading">Delete</button>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.viewer-layout {
  display: flex;
  min-height: calc(100vh - 54px);
  height: calc(100vh - 54px);
  width: 100%;
  overflow: hidden;
}

.panel {
  width: 280px;
  flex: 0 0 auto;
  background: var(--panel-bg);
  border-right: 1px solid var(--border);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-block--fill {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

.row {
  display: flex;
  gap: 10px;
}

.column {
  display: flex;
  flex-direction: column;
}

.gap {
  gap: 8px;
}

.chip {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--panel-bg-alt);
  color: var(--text-primary);
  border: 1px solid var(--border);
  font-weight: 700;
}

.chip--wide {
  width: 100%;
  text-align: center;
  display: block;
}

.chip--active {
  background: var(--accent-gradient);
  color: var(--text-inverse);
}

.pill {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--panel-bg-alt);
  color: var(--text-primary);
  border: 1px solid var(--border);
  text-align: left;
  font-weight: 700;
}

.pill--toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pill-state {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
}

.pill--active .pill-state {
  color: var(--text-inverse);
}

.pill--active {
  border-color: var(--accent-strong);
  box-shadow: var(--accent-shadow);
}

.pill:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.items-block {
  flex: 1;
}

.items-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.debug-readout {
  padding: 8px 10px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: var(--panel-bg-glass);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.debug-planes {
  max-height: 80px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.muted {
  color: var(--text-muted);
}

.small {
  font-size: 0.88rem;
}

.tiny {
  font-size: 0.75rem;
}

.strong {
  font-weight: 700;
  margin: 0;
}

.item-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg-strong);
  padding: 10px;
}

.element-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-bg-glass);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.materials-table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-bg-strong);
  display: flex;
  flex-direction: column;
}

.materials-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.materials-empty {
  padding: 10px;
}

.input--dense {
  padding: 8px 10px;
  font-size: 0.85rem;
}

.materials-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 420px;
}

.materials-table thead th {
  position: sticky;
  top: 0;
  background: var(--panel-bg);
  color: var(--text-soft);
  text-align: left;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.materials-table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.materials-table tbody tr:last-child td {
  border-bottom: 0;
}

.materials-table tbody tr:hover {
  background: var(--panel-bg-hover);
}

.material-cell--name {
  width: 40%;
}

.material-name {
  margin: 0;
  font-size: 0.9rem;
}

.material-color {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  width: 42px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
}

.material-transparency {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.material-transparency input[type='range'] {
  width: 100%;
}

.transparency-input {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input--tiny {
  padding: 6px 8px;
  font-size: 0.8rem;
  width: 64px;
}

.material-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.material-preview-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.material-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.material-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  background: var(--panel-bg);
  box-shadow: var(--swatch-shadow);
  flex: 0 0 auto;
}

.link {
  color: var(--link);
  font-size: 0.9rem;
}

.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  border: 1px solid var(--notice-border);
  background: var(--notice-bg);
}

.notice--error {
  border-color: var(--notice-error-border);
  background: var(--notice-error-bg);
  color: var(--notice-error-text);
}

.form-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-bg-elevated);
  padding: 12px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-bg-alt);
  color: var(--text-primary);
}

.coords {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.primary {
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: 10px;
  background: var(--accent-gradient);
  color: var(--text-inverse);
  font-weight: 700;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.row .primary {
  width: 100%;
}

.danger {
  width: 140px;
  padding: 12px 14px;
  border: 1px solid var(--danger-border);
  border-radius: 10px;
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 700;
  cursor: pointer;
}

.danger:hover {
  background: var(--danger-bg-hover);
}

.danger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  height: 100%;
}

.resizer {
  width: 10px;
  cursor: ew-resize;
  background: var(--resizer-gradient);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  transition: background 0.2s ease;
  flex: 0 0 10px;
}

.resizer:hover {
  background: var(--resizer-gradient-hover);
}

.detail-panel {
  width: 280px;
  flex: 0 0 auto;
  background: var(--panel-bg);
  border-left: 1px solid var(--border);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.tab-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tab-btn {
  border: 1px solid var(--border);
  background: var(--panel-bg-strong);
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.tab-btn--active {
  background: var(--accent-gradient);
  border-color: transparent;
  color: var(--text-inverse);
  box-shadow: var(--accent-shadow);
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.viewer {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--viewer-bg);
  position: relative;
}

:deep(.viewer canvas) {
  display: block;
}

.overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

.overlay-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}

.canvas-tools {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 6;
}

.canvas-tools-right {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 6;
}

.canvas-bg-toggle,
.canvas-settings-toggle,
.canvas-table-toggle {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: var(--panel-bg-glass-strong);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-context);
  transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.canvas-bg-toggle:hover,
.canvas-settings-toggle:hover,
.canvas-table-toggle:hover {
  transform: translateY(-1px);
}

.canvas-bg-toggle svg,
.canvas-settings-toggle svg,
.canvas-table-toggle svg {
  width: 18px;
  height: 18px;
}

.canvas-settings {
  position: absolute;
  top: 56px;
  left: 12px;
  width: min(280px, 80vw);
  max-height: calc(100% - 80px);
  overflow: auto;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: var(--panel-bg-glass-strong);
  box-shadow: var(--shadow-context);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 6;
}

.canvas-elements-panel {
  position: absolute;
  top: 56px;
  right: 12px;
  width: min(420px, 90vw);
  max-height: calc(100% - 80px);
  overflow: auto;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: var(--panel-bg-glass-strong);
  box-shadow: var(--shadow-context);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 6;
}

.elements-tabs {
  display: flex;
  gap: 8px;
}

.elements-tab {
  flex: 1;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--panel-bg-strong);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 700;
}

.elements-tab--active {
  background: var(--accent-gradient);
  color: var(--text-inverse);
  border-color: transparent;
  box-shadow: var(--accent-shadow);
}

.elements-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.settings-close {
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.2rem;
  line-height: 1;
  padding: 0 4px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-row {
  display: grid;
  grid-template-columns: 80px 1fr 48px;
  align-items: center;
  gap: 8px;
}

.settings-row input[type='color'] {
  justify-self: start;
  width: 42px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-bg);
}

.settings-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.settings-value {
  font-size: 0.78rem;
  color: var(--text-soft);
  text-align: right;
}

.elements-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.elements-table-wrap {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-bg-strong);
  overflow: auto;
  min-height: 160px;
}

.elements-empty {
  padding: 10px;
}

.elements-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}

.elements-table thead th {
  position: sticky;
  top: 0;
  background: var(--panel-bg);
  color: var(--text-soft);
  text-align: left;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.elements-table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.elements-table tbody tr:last-child td {
  border-bottom: 0;
}

.elements-table tbody tr:hover {
  background: var(--panel-bg-hover);
}

.elements-cell {
  font-size: 0.85rem;
}

.elements-input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-bg-alt);
  color: var(--text-primary);
  font-size: 0.82rem;
}

.elements-row {
  cursor: pointer;
}

.elements-row--active {
  background: var(--elements-selected-bg);
  color: var(--elements-selected-text);
}

.elements-row--active td {
  background: var(--elements-selected-bg);
  color: var(--elements-selected-text);
}

.elements-row--active .elements-input {
  background: var(--elements-selected-bg);
  color: var(--elements-selected-text);
  border-color: var(--elements-selected-text);
}

.context-menu {
  position: absolute;
  z-index: 7;
  min-width: 180px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: var(--context-bg);
  box-shadow: var(--shadow-context);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.context-menu__item {
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  font-size: 0.85rem;
  cursor: pointer;
}

.context-menu__item:hover {
  background: var(--context-hover);
}

.loading,
.error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-bg);
  font-weight: 700;
}

.error {
  background: var(--overlay-error-bg);
}

.marker {
  position: absolute;
  background: var(--marker-bg);
  color: var(--marker-text);
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: var(--shadow-marker);
  transition: transform 0.2s ease, opacity 0.2s ease;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;
}

.marker--active {
  background: var(--marker-active-bg);
  transform: translate(-50%, -50%) scale(1.05);
}

:deep(.sensor-panel) {
  position: absolute;
  min-width: 160px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: var(--panel-bg-glass-strong);
  box-shadow: var(--shadow-context);
  font-size: 0.72rem;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: opacity 0.2s ease;
}

:deep(.sensor-panel--weather) {
  min-width: 220px;
}

:deep(.sensor-panel__title) {
  font-weight: 700;
  font-size: 0.78rem;
}

:deep(.sensor-panel__title-row) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.sensor-panel__status) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

:deep(.sensor-panel__status--online) {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

:deep(.sensor-panel__status--offline) {
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}

:deep(.sensor-panel__metrics) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

:deep(.sensor-panel__metrics--weather) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

:deep(.sensor-panel__metric) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.68rem;
  color: var(--text-muted);
}

:deep(.sensor-panel__metric strong) {
  color: var(--text-primary);
  font-weight: 700;
  font-size: 0.78rem;
}

.item-card--active {
  border-color: var(--accent-strong);
  box-shadow: 0 0 0 1px var(--accent-strong);
}
</style>
