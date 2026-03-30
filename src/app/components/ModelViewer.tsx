import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { StandardizedHeaderS } from '../../imports/SharedHeader';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

type ViewPreset = 'all' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

interface ModelViewerProps {
  projectTitle: string;
  buildingType?: string;
  onClose: () => void;
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  authButtonLabel?: string;
  onAuthButtonClick?: () => void;
  rawPointCloudUrl?: string;
  instancedPointCloudUrl?: string;
  bimModelUrl?: string;
  bimIfcUrl?: string;
  bimPropsUrl?: string;
}

interface FilterCategory {
  name: string;
  items: { id: string; name: string; enabled: boolean }[];
}

interface LayerDisplayItem {
  id: string;
  name: string;
  enabled: boolean;
}

interface GroupedFilterCategory {
  type: string;
  name: string;
  items: string[];
}

interface SelectedElement {
  type: string;
  elementId?: string;
  material?: string;
  dimensions: string;
  properties: { label: string; value: string }[];
}

interface BimElementProps {
  id: string;
  className?: string;
  name?: string;
  dimensions?: {
    x: number;
    y: number;
    z: number;
  };
  type?: string;
}

interface LegendItem {
  name: string;
  color: string;
}

interface ZoomCommand {
  type: 'in' | 'out';
  nonce: number;
}

function ViewCube({
  activePreset,
  onSelect,
}: {
  activePreset: ViewPreset;
  onSelect: (preset: ViewPreset) => void;
}) {
  const presetRotations: Record<ViewPreset, { x: number; y: number }> = {
    all: { x: -28, y: 35 },
    front: { x: 0, y: 0 },
    back: { x: 0, y: 180 },
    left: { x: 0, y: -90 },
    right: { x: 0, y: 90 },
    top: { x: -90, y: 0 },
    bottom: { x: 90, y: 0 },
  };
  const [rotation, setRotation] = useState(presetRotations[activePreset]);
  const dragState = useRef<{ dragging: boolean; x: number; y: number }>({
    dragging: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    setRotation(presetRotations[activePreset]);
  }, [activePreset]);

  const startDrag = (clientX: number, clientY: number) => {
    dragState.current = { dragging: true, x: clientX, y: clientY };
  };

  const updateDrag = (clientX: number, clientY: number) => {
    if (!dragState.current.dragging) {
      return;
    }

    const deltaX = clientX - dragState.current.x;
    const deltaY = clientY - dragState.current.y;
    dragState.current.x = clientX;
    dragState.current.y = clientY;

    setRotation((current) => ({
      x: Math.max(-120, Math.min(120, current.x - deltaY * 0.45)),
      y: current.y + deltaX * 0.45,
    }));
  };

  const endDrag = () => {
    dragState.current.dragging = false;
  };

  const handleFaceClick = (preset: Exclude<ViewPreset, 'all'>) => {
    setRotation(presetRotations[preset]);
    onSelect(preset);
  };

  const faceBaseClass =
    "absolute flex items-center justify-center rounded-[0.52vw] border font-['Satoshi_Variable:Bold',sans-serif] tracking-[0.08em] text-[0.58vw] transition-colors cursor-pointer select-none";
  const getFaceColors = (preset: Exclude<ViewPreset, 'all'>) =>
    activePreset === preset
      ? 'border-[#5ed6aa] bg-[#91f9d0] text-[#000001]'
      : 'border-[#d7d7d7] bg-white/94 text-[#333333] hover:bg-[#f5f5f5]';
  const activeLabel =
    activePreset === 'all' ? 'Perspective' : activePreset.charAt(0).toUpperCase() + activePreset.slice(1);
  const cubeSize = '3.3vw';
  const halfDepth = '1.65vw';

  return (
    <div className="absolute top-[1.04vw] right-[1.04vw] z-10 rounded-[0.78vw] border border-[#d7d7d7] bg-white/92 p-[0.58vw] shadow-sm backdrop-blur-[2px]">
      <div className="mb-[0.52vw] flex items-center justify-between">
        <div>
          <p className="font-['Satoshi_Variable:Bold',sans-serif] text-[0.73vw] text-[#000001]">View Cube</p>
          <p className="font-['Satoshi_Variable:Medium',sans-serif] text-[0.62vw] uppercase tracking-[0.12em] text-[#666666]">
            {activeLabel}
          </p>
        </div>
        <button
          onClick={() => onSelect('all')}
          className={`rounded-[0.42vw] px-[0.52vw] py-[0.21vw] text-[0.62vw] font-['Satoshi_Variable:Bold',sans-serif] tracking-[0.08em] transition-colors ${
            activePreset === 'all'
              ? 'bg-[#91f9d0] text-[#000001]'
              : 'bg-[#f5f5f5] text-[#333333] hover:bg-[#ebebeb]'
          }`}
        >
          ALL
        </button>
      </div>

      <div
        className="relative h-[7.4vw] w-[7.4vw]"
        style={{ perspective: '18vw' }}
        onMouseLeave={endDrag}
        onMouseUp={endDrag}
        onMouseMove={(event) => updateDrag(event.clientX, event.clientY)}
      >
        <div
          className="absolute inset-0"
          onMouseDown={(event) => startDrag(event.clientX, event.clientY)}
          style={{ cursor: dragState.current.dragging ? 'grabbing' : 'grab' }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: cubeSize,
              height: cubeSize,
              transformStyle: 'preserve-3d',
              transform: `translate(-50%, -50%) rotateX(${rotation.x}deg) rotateZ(0deg) rotateY(${rotation.y}deg)`,
              transition: dragState.current.dragging ? 'none' : 'transform 180ms ease-out',
            }}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFaceClick('front');
              }}
              className={`${faceBaseClass} ${getFaceColors('front')}`}
              style={{ width: cubeSize, height: cubeSize, transform: `translateZ(${halfDepth})` }}
            >
              FRONT
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFaceClick('back');
              }}
              className={`${faceBaseClass} ${getFaceColors('back')}`}
              style={{ width: cubeSize, height: cubeSize, transform: `rotateY(180deg) translateZ(${halfDepth})` }}
            >
              BACK
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFaceClick('right');
              }}
              className={`${faceBaseClass} ${getFaceColors('right')}`}
              style={{ width: cubeSize, height: cubeSize, transform: `rotateY(90deg) translateZ(${halfDepth})` }}
            >
              RIGHT
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFaceClick('left');
              }}
              className={`${faceBaseClass} ${getFaceColors('left')}`}
              style={{ width: cubeSize, height: cubeSize, transform: `rotateY(-90deg) translateZ(${halfDepth})` }}
            >
              LEFT
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFaceClick('top');
              }}
              className={`${faceBaseClass} ${getFaceColors('top')}`}
              style={{ width: cubeSize, height: cubeSize, transform: `rotateX(90deg) translateZ(${halfDepth})` }}
            >
              TOP
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFaceClick('bottom');
              }}
              className={`${faceBaseClass} ${getFaceColors('bottom')}`}
              style={{ width: cubeSize, height: cubeSize, transform: `rotateX(-90deg) translateZ(${halfDepth})` }}
            >
              BOTTOM
            </button>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            <p className="rounded-full bg-[#f5f5f5] px-[0.52vw] py-[0.18vw] font-['Satoshi_Variable:Medium',sans-serif] text-[0.58vw] uppercase tracking-[0.1em] text-[#666666]">
              Drag to rotate
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const classOrder = ['ceiling', 'floor', 'wall', 'beam', 'column', 'window', 'door', 'unassigned'];
const DEFAULT_FILTERS: FilterCategory[] = [
  {
    name: 'Structure',
    items: [
      { id: 'Walls', name: 'Walls', enabled: true },
      { id: 'Ceilings', name: 'Ceilings', enabled: true },
      { id: 'Floors', name: 'Floors', enabled: true },
      { id: 'Columns', name: 'Columns', enabled: true },
      { id: 'Beams', name: 'Beams', enabled: true },
    ],
  },
  {
    name: 'Architecture',
    items: [
      { id: 'Windows', name: 'Windows', enabled: true },
      { id: 'Doors', name: 'Doors', enabled: true },
      { id: 'Stairs', name: 'Stairs', enabled: false },
    ],
  },
];

const prettyTypeLabel = (type: string) => {
  const normalized = type.toLowerCase();
  if (normalized === 'unassigned') return 'Other';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const toCategoryName = (type: string) => {
  const pretty = prettyTypeLabel(type);
  if (type.toLowerCase() === 'unassigned') return 'Other';
  return pretty.endsWith('s') ? pretty : `${pretty}s`;
};

const inferElementType = (value: string) => {
  const normalized = (value || '').toLowerCase();
  if (normalized.includes('wall')) return 'wall';
  if (normalized.includes('floor') || normalized.includes('slab')) return 'floor';
  if (normalized.includes('ceiling') || normalized.includes('covering')) return 'ceiling';
  if (normalized.includes('column')) return 'column';
  if (normalized.includes('beam')) return 'beam';
  if (normalized.includes('window')) return 'window';
  if (normalized.includes('door')) return 'door';
  if (normalized.includes('stair')) return 'stair';
  return 'unassigned';
};

const toDisplayElementType = (value?: string) => {
  const inferred = inferElementType(value || '');
  return classOrder.includes(inferred) ? inferred : 'unassigned';
};

const getDimensionsFromGeometry = (geometry?: { [key: string]: number } | null) => {
  if (!geometry) return undefined;

  const keys = ['start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z'] as const;
  if (!keys.every((key) => Object.hasOwn(geometry, key) && Number.isFinite(Number(geometry[key])))) {
    return undefined;
  }

  return {
    x: Math.abs(Number(geometry.end_x) - Number(geometry.start_x)),
    y: Math.abs(Number(geometry.end_y) - Number(geometry.start_y)),
    z: Math.abs(Number(geometry.end_z) - Number(geometry.start_z)),
  };
};

const buildFiltersFromBimProps = (propsById: Record<string, BimElementProps>) => {
  const grouped: Record<string, GroupedFilterCategory> = {};

  Object.entries(propsById).forEach(([id, element]) => {
    const type = inferElementType(element.className || element.type || id);
    if (!grouped[type]) {
      grouped[type] = {
        type,
        name: toCategoryName(type),
        items: [],
      };
    }

    grouped[type].items.push(id);
  });

  const categories: GroupedFilterCategory[] = [];
  const appended = new Set<string>();
  classOrder.forEach((type) => {
    if (grouped[type]) {
      categories.push(grouped[type]);
      appended.add(type);
    }
  });

  Object.entries(grouped).forEach(([type, category]) => {
    if (!appended.has(type)) {
      categories.push(category);
      appended.add(type);
    }
  });

  return categories.map((category) => {
    const sortedIds = category.items.sort((a, b) => a.localeCompare(b));
    const layerItems: LayerDisplayItem[] = sortedIds.map((id, index) => {
      const count = index + 1;
      return {
        id,
        name: `${category.type}${count}`,
        enabled: true,
      };
    });

    return {
      ...category,
      items: layerItems,
    };
  });
};

const toLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

const getUploadedFileNameFromUrl = (rawPointCloudUrl?: string) => {
  if (!rawPointCloudUrl) {
    return 'Unknown file';
  }

  try {
    const pathname = new URL(rawPointCloudUrl).pathname;
    const filename = pathname.split('/').filter(Boolean).pop();
    if (!filename) {
      return 'Unknown file';
    }

    const decoded = decodeURIComponent(filename);
    const cleaned = decoded.replace(/^\d+-/, '');
    return cleaned || decoded;
  } catch {
    return 'Unknown file';
  }
};

const getRepresentativeColorFromPly = (url: string): Promise<[number, number, number] | null> =>
  new Promise((resolve) => {
    const loader = new PLYLoader();
    loader.load(
      url,
      (geometry) => {
        const colorAttr = geometry.getAttribute('color');
        if (!colorAttr || colorAttr.count === 0) {
          resolve(null);
          return;
        }

        const colorArray = colorAttr.array as ArrayLike<number>;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;

        for (let i = 0; i < colorArray.length; i += 3) {
          let r = colorArray[i] as number;
          let g = colorArray[i + 1] as number;
          let b = colorArray[i + 2] as number;
          if (Math.max(r, g, b) > 1.0) {
            r /= 255;
            g /= 255;
            b /= 255;
          }
          sumR += r;
          sumG += g;
          sumB += b;
        }

        const n = colorAttr.count;
        const rr = Math.max(0, Math.min(255, Math.round((sumR / n) * 255)));
        const gg = Math.max(0, Math.min(255, Math.round((sumG / n) * 255)));
        const bb = Math.max(0, Math.min(255, Math.round((sumB / n) * 255)));
        resolve([rr, gg, bb]);
      },
      undefined,
      () => resolve(null),
    );
  });

function ThreeScene({
  filters,
  containerRef,
  pointCloudUrl,
  bimModelUrl,
  viewMode,
  viewPreset,
  zoomCommand,
  elementVisibility,
  onBimSelect,
}: {
  filters: FilterCategory[];
  containerRef: React.RefObject<HTMLDivElement>;
  pointCloudUrl?: string;
  bimModelUrl?: string;
  viewMode: 'instanced' | 'bim';
  viewPreset: ViewPreset;
  zoomCommand: ZoomCommand | null;
  elementVisibility?: Record<string, boolean>;
  onBimSelect?: (id: string | null) => void;
}) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const orbitRadiusRef = useRef(12);
  const azimuthRef = useRef(-Math.PI / 4);
  const elevationRef = useRef(0.65);
  const presetRef = useRef<ViewPreset>(viewPreset);
  const contentSizeRef = useRef(new THREE.Vector3(1, 1, 1));
  const zoomCommandNonceRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xfafafa);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const updateCameraPosition = () => {
      const target = targetRef.current;
      const radius = orbitRadiusRef.current;
      const azimuth = azimuthRef.current;
      const elevation = elevationRef.current;
      const planarRadius = radius * Math.cos(elevation);

      camera.position.set(
        target.x + planarRadius * Math.cos(azimuth),
        target.y + planarRadius * Math.sin(azimuth),
        target.z + radius * Math.sin(elevation),
      );
      camera.lookAt(target);
    };

    const applyCameraPreset = (preset: ViewPreset) => {
      presetRef.current = preset;

      const size = contentSizeRef.current;
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      orbitRadiusRef.current = Math.max(8, maxDim * 2.4);

      switch (preset) {
        case 'top':
          azimuthRef.current = 0;
          elevationRef.current = Math.PI / 2 - 0.01;
          break;
        case 'bottom':
          azimuthRef.current = 0;
          elevationRef.current = -Math.PI / 2 + 0.01;
          break;
        case 'left':
          azimuthRef.current = Math.PI;
          elevationRef.current = 0;
          break;
        case 'right':
          azimuthRef.current = 0;
          elevationRef.current = 0;
          break;
        case 'front':
          azimuthRef.current = -Math.PI / 2;
          elevationRef.current = 0;
          break;
        case 'back':
          azimuthRef.current = Math.PI / 2;
          elevationRef.current = 0;
          break;
        case 'all':
        default:
          azimuthRef.current = -Math.PI / 4;
          elevationRef.current = 0.65;
          break;
      }

      updateCameraPosition();
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      azimuthRef.current -= deltaX * 0.008;
      elevationRef.current = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, elevationRef.current + deltaY * 0.008),
      );
      updateCameraPosition();

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      orbitRadiusRef.current = Math.max(2, Math.min(100, orbitRadiusRef.current * factor));
      updateCameraPosition();
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('wheel', handleWheel);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight1.position.set(10, 10, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);

    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xe8e9eb);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    const roomElements: THREE.Mesh[] = [];
    const disposableMaterials = new Set<THREE.Material>();
    const disposableGeometries = new Set<THREE.BufferGeometry>();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const normalizedGroup = new THREE.Group();
    const contentGroup = new THREE.Group();
    normalizedGroup.add(contentGroup);
    scene.add(normalizedGroup);

    const fitContentToView = () => {
      if (contentGroup.children.length === 0) {
        return;
      }

      normalizedGroup.scale.setScalar(1);
      contentGroup.position.set(0, 0, 0);
      contentGroup.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(contentGroup);
      if (box.isEmpty()) {
        return;
      }

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      contentGroup.position.set(-center.x, -center.y, -center.z);
      const normalizedScale = 5 / maxDim;
      normalizedGroup.scale.setScalar(normalizedScale);
      contentSizeRef.current.copy(size).multiplyScalar(normalizedScale);
      orbitRadiusRef.current = Math.max(8, Math.max(contentSizeRef.current.x, contentSizeRef.current.y, contentSizeRef.current.z) * 2.4);
      applyCameraPreset(presetRef.current);
    };

    if (pointCloudUrl) {
      const loader = new PLYLoader();
      loader.load(
        pointCloudUrl,
        (geometry) => {
          const colorAttr = geometry.getAttribute('color');
          if (colorAttr) {
            const colorArray = colorAttr.array as ArrayLike<number>;
            let maxValue = 0;
            const step = Math.max(1, Math.floor(colorArray.length / 3000));
            for (let i = 0; i < colorArray.length; i += step) {
              const value = colorArray[i] as number;
              if (value > maxValue) maxValue = value;
            }

            if (maxValue > 1.0) {
              for (let i = 0; i < colorArray.length; i += 1) {
                colorArray[i] = (colorArray[i] as number) / 255;
              }
              colorAttr.needsUpdate = true;
            }
          }

          const material = new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            sizeAttenuation: true,
            opacity: viewMode === 'bim' ? 0.45 : 1,
            transparent: viewMode === 'bim',
          });

          const points = new THREE.Points(geometry, material);
          points.renderOrder = 1;
          contentGroup.add(points);
          disposableGeometries.add(geometry);
          disposableMaterials.add(material);
          fitContentToView();
        },
        (progress) => {
          console.log('Loading point cloud:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
        },
        (error) => {
          console.error('Error loading point cloud:', error);
        }
      );
    }

    if (bimModelUrl) {
      const loader = new OBJLoader();
      loader.load(
        bimModelUrl,
        (obj) => {
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              const sourceName = mesh.name || mesh.parent?.name || '';
              const resolvedElementId = sourceName || `mesh_${obj.name || roomElements.length}`;
              mesh.userData.bimId = resolvedElementId;
              mesh.userData.bimClass = inferElementType(sourceName || mesh.name || mesh.parent?.name || '');
              mesh.visible = !(elementVisibility && resolvedElementId in elementVisibility)
                ? true
                : !!elementVisibility[resolvedElementId];
              if (!mesh.material) {
                mesh.material = new THREE.MeshStandardMaterial({ color: 0xbdbdbd });
              }
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((material) => disposableMaterials.add(material));
              } else {
                disposableMaterials.add(mesh.material);
              }
              disposableGeometries.add(mesh.geometry);
            }
          });

          obj.renderOrder = 2;
          contentGroup.add(obj);
          fitContentToView();
        },
        undefined,
        (error) => {
          console.error('Error loading BIM OBJ:', error);
        }
      );
    }

    if (!pointCloudUrl && !bimModelUrl) {
      // Original room rendering code (only if no point cloud)
      const isEnabled = (category: string, item: string) => {
        const cat = filters.find(f => f.name === category);
        const filterItem = cat?.items.find(i => i.name === item);
        return filterItem?.enabled ?? true;
      };

      // Floor
      if (isEnabled('Structure', 'Floors')) {
        const floorGeometry = new THREE.PlaneGeometry(10, 10);
        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.z = 0;
        scene.add(floor);
        roomElements.push(floor);
      }

      // Walls
      if (isEnabled('Structure', 'Walls')) {
        // Back wall
        const backWallGeometry = new THREE.BoxGeometry(10, 3, 0.2);
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e9eb });
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, -5, 1.5);
        scene.add(backWall);
        roomElements.push(backWall);

        // Left wall
        const leftWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 10, 3),
          new THREE.MeshStandardMaterial({ color: 0xe8e9eb })
        );
        leftWall.position.set(-5, 0, 1.5);
        scene.add(leftWall);
        roomElements.push(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 10, 3),
          new THREE.MeshStandardMaterial({ color: 0xe8e9eb })
        );
        rightWall.position.set(5, 0, 1.5);
        scene.add(rightWall);
        roomElements.push(rightWall);
      }

      // Ceiling
      if (isEnabled('Structure', 'Ceilings')) {
        const ceilingGeometry = new THREE.PlaneGeometry(10, 10);
        const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.z = 3;
        scene.add(ceiling);
        roomElements.push(ceiling);
      }

      // Windows
      if (isEnabled('Architecture', 'Windows')) {
        const windowGeometry = new THREE.BoxGeometry(2, 1.5, 0.1);
        const windowMaterial = new THREE.MeshStandardMaterial({ 
          color: 0xa0d8f0, 
          transparent: true, 
          opacity: 0.6 
        });
        
        const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
        window1.position.set(-2, -4.95, 2);
        scene.add(window1);
        roomElements.push(window1);

        const window2 = new THREE.Mesh(windowGeometry, windowMaterial.clone());
        window2.position.set(2, -4.95, 2);
        scene.add(window2);
        roomElements.push(window2);
      }

      // Door
      if (isEnabled('Architecture', 'Doors')) {
        const doorGeometry = new THREE.BoxGeometry(1.2, 2.5, 0.1);
        const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6f47 });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(4.95, 2, 1.25);
        scene.add(door);
        roomElements.push(door);
      }

      // Columns
      if (isEnabled('Structure', 'Columns')) {
        const columnGeometry = new THREE.BoxGeometry(0.4, 3, 0.4);
        const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        
        const column1 = new THREE.Mesh(columnGeometry, columnMaterial);
        column1.position.set(-3, -3, 1.5);
        scene.add(column1);
        roomElements.push(column1);

        const column2 = new THREE.Mesh(columnGeometry, columnMaterial.clone());
        column2.position.set(3, -3, 1.5);
        scene.add(column2);
        roomElements.push(column2);
      }

      // Beams
      if (isEnabled('Structure', 'Beams')) {
        const beamGeometry = new THREE.BoxGeometry(10, 0.3, 0.3);
        const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.set(0, -3, 2.85);
        scene.add(beam);
        roomElements.push(beam);
      }
    }

    applyCameraPreset(presetRef.current);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleClick = (e: MouseEvent) => {
      if (viewMode !== 'bim' || !bimModelUrl || !onBimSelect) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((item) => (item.object as THREE.Mesh).isMesh);
      if (!hit) {
        onBimSelect(null);
        return;
      }

      const obj = hit.object as THREE.Mesh;
      const id = obj.userData.bimId || obj.name || obj.parent?.name || null;
      onBimSelect(id ? String(id) : null);
    };
    renderer.domElement.addEventListener('click', handleClick);

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('click', handleClick);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      disposableGeometries.forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
      roomElements.forEach(mesh => {
        mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      });
      sceneRef.current = null;
    };
  }, [filters, pointCloudUrl, bimModelUrl, viewMode, containerRef, onBimSelect, elementVisibility]);

  useEffect(() => {
    if (!cameraRef.current) {
      return;
    }

    presetRef.current = viewPreset;
    const size = contentSizeRef.current;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    orbitRadiusRef.current = Math.max(8, maxDim * 2.4);

    switch (viewPreset) {
      case 'top':
        azimuthRef.current = 0;
        elevationRef.current = Math.PI / 2 - 0.01;
        break;
      case 'bottom':
        azimuthRef.current = 0;
        elevationRef.current = -Math.PI / 2 + 0.01;
        break;
      case 'left':
        azimuthRef.current = Math.PI;
        elevationRef.current = 0;
        break;
      case 'right':
        azimuthRef.current = 0;
        elevationRef.current = 0;
        break;
      case 'front':
        azimuthRef.current = -Math.PI / 2;
        elevationRef.current = 0;
        break;
      case 'back':
        azimuthRef.current = Math.PI / 2;
        elevationRef.current = 0;
        break;
      case 'all':
      default:
        azimuthRef.current = -Math.PI / 4;
        elevationRef.current = 0.65;
        break;
    }

    const target = targetRef.current;
    const radius = orbitRadiusRef.current;
    const planarRadius = radius * Math.cos(elevationRef.current);

    cameraRef.current.position.set(
      target.x + planarRadius * Math.cos(azimuthRef.current),
      target.y + planarRadius * Math.sin(azimuthRef.current),
      target.z + radius * Math.sin(elevationRef.current),
    );
    cameraRef.current.lookAt(target);
  }, [viewPreset]);

  useEffect(() => {
    if (!zoomCommand || zoomCommand.nonce === zoomCommandNonceRef.current || !cameraRef.current) {
      return;
    }

    zoomCommandNonceRef.current = zoomCommand.nonce;
    const factor = zoomCommand.type === 'in' ? 0.9 : 1.1;
    orbitRadiusRef.current = Math.max(2, Math.min(100, orbitRadiusRef.current * factor));

    const target = targetRef.current;
    const radius = orbitRadiusRef.current;
    const planarRadius = radius * Math.cos(elevationRef.current);

    cameraRef.current.position.set(
      target.x + planarRadius * Math.cos(azimuthRef.current),
      target.y + planarRadius * Math.sin(azimuthRef.current),
      target.z + radius * Math.sin(elevationRef.current),
    );
    cameraRef.current.lookAt(target);
  }, [zoomCommand]);

  useEffect(() => {
    if (!bimModelUrl || !elementVisibility || !sceneRef.current) {
      return;
    }

    sceneRef.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh?.isMesh || !mesh.userData?.bimId) {
        return;
      }
      const elementId = String(mesh.userData.bimId);
      if (Object.hasOwn(elementVisibility, elementId)) {
        mesh.visible = !!elementVisibility[elementId];
      }
    });
  }, [bimModelUrl, elementVisibility]);

  return null;
}

export default function ModelViewer({
  projectTitle,
  buildingType,
  onClose,
  onNavigateHome,
  onNavigateGetStarted,
  onNavigateLibrary,
  authButtonLabel,
  onAuthButtonClick,
  rawPointCloudUrl,
  instancedPointCloudUrl,
  bimModelUrl,
  bimIfcUrl,
  bimPropsUrl,
}: ModelViewerProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [viewPreset, setViewPreset] = useState<ViewPreset>('all');
  const [zoomCommand, setZoomCommand] = useState<ZoomCommand | null>(null);

  const [activeTab, setActiveTab] = useState<'instanced' | 'bim'>('instanced');

  const availableTabs = [
    { key: 'instanced' as const, label: 'Instantiated', url: instancedPointCloudUrl },
    { key: 'bim' as const, label: 'Final Model', url: bimModelUrl },
  ].filter((tab) => Boolean(tab.url));

  const resolvedTab = availableTabs.find((tab) => tab.key === activeTab) || availableTabs[0];
  const activePointCloudUrl = resolvedTab?.key === 'bim'
    ? undefined
    : resolvedTab?.url;
  const activeBimModelUrl = resolvedTab?.key === 'bim' ? bimModelUrl : undefined;
  
  const [filters, setFilters] = useState<FilterCategory[]>(DEFAULT_FILTERS);

  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [bimPropsById, setBimPropsById] = useState<Record<string, BimElementProps>>({});
  const [pointCloudLegend, setPointCloudLegend] = useState<LegendItem[]>([]);
  const [elementVisibility, setElementVisibility] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const uploadedFileName = getUploadedFileNameFromUrl(rawPointCloudUrl);

  useEffect(() => {
    setExpandedCategories((current) => {
      const next = { ...current };
      for (const category of filters) {
        if (!(category.name in next)) {
          next[category.name] = true;
        }
      }
      return next;
    });
  }, [filters]);
  useEffect(() => {
    let cancelled = false;

    const loadBimProps = async () => {
      if (!bimPropsUrl) {
        let loadedFromFallback = false;
        if (bimModelUrl) {
          const fallbackBimDataUrl = bimModelUrl.replace(/[^/]+$/, 'bim_reconstruction_data.json');
          try {
            const fallbackResponse = await fetch(fallbackBimDataUrl);
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json() as unknown;
              const parsed: Record<string, BimElementProps> = {};
              if (Array.isArray(fallbackData)) {
                fallbackData.forEach((rawItem, index) => {
                  if (!rawItem || typeof rawItem !== 'object') {
                    return;
                  }
                  const item = rawItem as Record<string, unknown>;
                  const id = typeof item.id === 'string' && item.id.trim().length > 0
                    ? item.id
                    : `element_${index}`;
                  const inferredType = inferElementType((item.type as string) || (item.className as string) || item.id || id);
                  parsed[id] = {
                    id,
                    className: typeof item.type === 'string' ? item.type : inferredType,
                    name: typeof item.name === 'string' ? item.name : id,
                    dimensions: typeof item.geometry === 'object'
                      ? getDimensionsFromGeometry(item.geometry as Record<string, number>)
                      : undefined,
                    type: inferredType,
                  };
                });
              } else if (fallbackData && typeof fallbackData === 'object') {
                Object.entries(fallbackData).forEach(([id, rawItem]) => {
                  if (!rawItem || typeof rawItem !== 'object') {
                    return;
                  }
                  const item = rawItem as Record<string, unknown>;
                  const inferredType = inferElementType((item.type as string) || (item.className as string) || id);
                  parsed[id] = {
                    id,
                    className: typeof item.type === 'string' ? item.type : inferredType,
                    name: typeof item.name === 'string' ? item.name : id,
                    dimensions: (item.geometry && typeof item.geometry === 'object')
                      ? getDimensionsFromGeometry(item.geometry as Record<string, number>)
                      : undefined,
                    type: inferredType,
                  };
                });
              }

              if (!cancelled) {
                setBimPropsById(parsed);
                const nextFilters = buildFiltersFromBimProps(parsed);
                if (nextFilters.length > 0) {
                  setFilters(nextFilters);
                  setElementVisibility(
                    Object.fromEntries(nextFilters.flatMap((category) =>
                      category.items.map((item) => [item.id, item.enabled])
                    )) as Record<string, boolean>
                  );
                } else {
                  setFilters(DEFAULT_FILTERS);
                  setElementVisibility({});
                }
                loadedFromFallback = true;
              }
            }
          } catch {
            // fallback data unavailable
          }
        }
        if (loadedFromFallback) {
          return;
        }
        setBimPropsById({});
        setFilters(DEFAULT_FILTERS);
        setElementVisibility({});
        return;
      }
      try {
        const response = await fetch(bimPropsUrl);
        if (!response.ok) {
          setBimPropsById({});
          setFilters(DEFAULT_FILTERS);
          setElementVisibility({});
          return;
        }
        const data = await response.json() as unknown;

        const parsed: Record<string, BimElementProps> = {};
        if (Array.isArray(data)) {
          data.forEach((rawItem, index) => {
            if (!rawItem || typeof rawItem !== 'object') {
              return;
            }
            const item = rawItem as Record<string, unknown>;
            const id = typeof item.id === 'string' && item.id.trim().length > 0
              ? item.id
              : `element_${index}`;
            parsed[id] = {
              id,
              className: typeof item.className === 'string'
                ? item.className
                : typeof item.type === 'string'
                  ? item.type
                  : inferElementType(id),
              name: typeof item.name === 'string' ? item.name : id,
              dimensions: typeof item.geometry === 'object'
                ? getDimensionsFromGeometry(item.geometry as Record<string, number>)
                : undefined,
              type: typeof item.type === 'string' ? item.type : undefined,
            };
          });
        } else if (data && typeof data === 'object') {
          Object.entries(data).forEach(([id, rawItem]) => {
            if (!rawItem || typeof rawItem !== 'object') {
              return;
            }
            const item = rawItem as Record<string, unknown>;
            parsed[id] = {
              id,
              className: typeof item.className === 'string' ? item.className : inferElementType(id),
              name: typeof item.name === 'string' ? item.name : id,
              dimensions: (item.dimensions && typeof item.dimensions === 'object')
                ? {
                    x: Number(item.dimensions.x),
                    y: Number(item.dimensions.y),
                    z: Number(item.dimensions.z),
                  }
                : undefined,
              type: typeof item.className === 'string' ? item.className : undefined,
            };
          });
        }

        if (!cancelled) {
          setBimPropsById(parsed);
          const nextFilters = buildFiltersFromBimProps(parsed);
          if (nextFilters.length > 0) {
            setFilters(nextFilters);
            setElementVisibility(
              Object.fromEntries(nextFilters.flatMap((category) =>
                category.items.map((item) => [item.id, item.enabled])
              )) as Record<string, boolean>
            );
          } else {
            setFilters(DEFAULT_FILTERS);
            setElementVisibility({});
          }
        }
      } catch {
        if (!cancelled) {
          setBimPropsById({});
          setFilters(DEFAULT_FILTERS);
          setElementVisibility({});
        }
      }
    };

    loadBimProps();
    return () => {
      cancelled = true;
    };
  }, [bimPropsUrl, bimModelUrl]);

  const handleBimSelect = useCallback((id: string | null) => {
    if (!id) {
      setSelectedElement(null);
      return;
    }

    const info = bimPropsById[id];
    if (!info) {
      setSelectedElement({
        type: 'unassigned',
        elementId: id,
        dimensions: '-',
        properties: [],
      });
      return;
    }

    const fmt = (v?: number) => (v === undefined ? 'N/A' : `${v.toFixed(2)} m`);
    const dims = info.dimensions;
    const elementType = toDisplayElementType(info.className || info.type || info.name || info.id);
    setSelectedElement({
      type: elementType,
      elementId: info.id,
      material: 'N/A',
      dimensions: `${fmt(dims?.x)} x ${fmt(dims?.y)} x ${fmt(dims?.z)}`,
      properties: [
        { label: 'Size X', value: fmt(dims?.x) },
        { label: 'Size Y', value: fmt(dims?.y) },
        { label: 'Size Z', value: fmt(dims?.z) },
      ],
    });
  }, [bimPropsById]);

  useEffect(() => {
    if (resolvedTab?.key !== 'bim') {
      setSelectedElement(null);
    }
  }, [resolvedTab?.key]);

  useEffect(() => {
    let cancelled = false;

    const buildLegend = async () => {
      if (!activePointCloudUrl) {
        setPointCloudLegend([]);
        return;
      }

      const isInstancedCombined = /\/all_instances_combined\.ply$/i.test(activePointCloudUrl);

      if (resolvedTab?.key !== 'instanced' && resolvedTab?.key !== 'bim') {
        setPointCloudLegend([]);
        return;
      }

      const baseUrl = activePointCloudUrl.replace(/\/all_instances_combined\.ply$/i, '');
      if (baseUrl === activePointCloudUrl) {
        setPointCloudLegend([]);
        return;
      }

      try {
        const summaryResponse = await fetch(`${baseUrl}/instantiation_summary.json`);
        if (!summaryResponse.ok) {
          setPointCloudLegend([]);
          return;
        }

        const summary = await summaryResponse.json() as Record<string, number>;
        const legend: LegendItem[] = [];
        const legendMax = 60;

        for (const className of classOrder) {
          const instanceCount = Number(summary[className] || 0);
          if (instanceCount <= 0) continue;

          const instancePromises = Array.from({ length: instanceCount }, (_, idx) => {
            const fileIdx = String(idx).padStart(3, '0');
            const sampleUrl = `${baseUrl}/${className}/${className}_instance_${fileIdx}.ply`;
            return getRepresentativeColorFromPly(sampleUrl);
          });

          const colors = (await Promise.all(instancePromises)).filter(Boolean) as [number, number, number][];
          const uniqueByClass = new Map<string, [number, number, number]>();
          for (const [r, g, b] of colors) {
            const key = `${r},${g},${b}`;
            if (!uniqueByClass.has(key)) {
              uniqueByClass.set(key, [r, g, b]);
            }
          }

          const classColors = Array.from(uniqueByClass.values());
          classColors.forEach(([r, g, b], idx) => {
            if (legend.length >= legendMax) return;
            legend.push({
              name: classColors.length > 1 ? `${toLabel(className)} ${idx + 1}` : toLabel(className),
              color: `rgb(${r}, ${g}, ${b})`,
            });
          });
          if (legend.length >= legendMax) break;
        }

        if (!cancelled) {
          setPointCloudLegend(legend);
        }
      } catch {
        if (!cancelled) {
          setPointCloudLegend([]);
        }
      }
    };

    buildLegend();
    return () => {
      cancelled = true;
    };
  }, [activePointCloudUrl, resolvedTab?.key]);

  const toggleFilter = (categoryName: string, itemName: string) => {
    setFilters((prev) => prev.map(category => {
      if (category.name === categoryName) {
        const updatedItems = category.items.map(item =>
          item.id === itemName ? { ...item, enabled: !item.enabled } : item
        );
        const matchedItem = updatedItems.find(item => item.id === itemName);
        if (matchedItem) {
          setElementVisibility((current) => ({
            ...current,
            [itemName]: matchedItem.enabled,
          }));
        }
        return {
          ...category,
          items: updatedItems,
        };
      }
      return category;
    }));
  };

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((current) => ({
      ...current,
      [categoryName]: !(current[categoryName] ?? true),
    }));
  };

  return (
    <div className="fixed inset-0 bg-white z-50">
      {/* Header */}
      <StandardizedHeaderS
        onNavigateHome={onNavigateHome}
        onNavigateGetStarted={onNavigateGetStarted}
        onNavigateLibrary={onNavigateLibrary}
        activePage="library"
        authButtonLabel={authButtonLabel}
        onAuthButtonClick={onAuthButtonClick}
      />

      <div className="flex h-screen pt-[8.8vw]">
        {/* Left Sidebar - Filters */}
        <div className="w-[18.75vw] bg-[#f5f5f5] border-r border-[#d7d7d7] overflow-y-auto">
          <div className="p-[1.56vw]">
            <div className="mb-[1.56vw] rounded-[0.78vw] border border-[#d7d7d7] bg-white px-[0.94vw] py-[0.94vw]">
              <p className="font-['Satoshi_Variable:Bold',sans-serif] text-[0.78vw] uppercase tracking-[0.12em] text-[#666666]">
                File Details
              </p>
              <p className="mt-[0.42vw] break-all font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001]">
                {uploadedFileName}
              </p>
              <p className="mt-[0.26vw] font-['Satoshi_Variable:Medium',sans-serif] text-[0.83vw] text-[#666666]">
                {buildingType || 'Building type unavailable'}
              </p>
            </div>

            <div className="flex items-center justify-between mb-[1.04vw]">
              <h2 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.25vw] text-[#000001]">Layers</h2>
              <button onClick={onClose} className="p-[0.52vw] hover:bg-[#e8e9eb] rounded-[0.52vw] transition-colors">
                <X className="w-[1.25vw] h-[1.25vw]" />
              </button>
            </div>

            {filters.map((category) => {
              const isExpanded = expandedCategories[category.name] ?? true;

              return (
                <div key={category.name} className="mb-[1.04vw] overflow-hidden rounded-[0.78vw] border border-[#d7d7d7] bg-white">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.name)}
                    className="flex w-full items-center justify-between px-[0.78vw] py-[0.72vw] text-left hover:bg-[#f8f8f8] transition-colors"
                  >
                    <span className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001]">
                      {category.name}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-[1vw] w-[1vw] text-[#666666]" />
                    ) : (
                      <ChevronRight className="h-[1vw] w-[1vw] text-[#666666]" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#ececec] px-[0.52vw] py-[0.52vw]">
                      <div className="space-y-[0.42vw]">
                        {category.items.map((item) => (
                          <label key={item.id} className="flex items-center gap-[0.52vw] cursor-pointer hover:bg-[#e8e9eb] p-[0.52vw] rounded-[0.52vw] transition-colors">
                            <input
                              type="checkbox"
                              checked={item.enabled}
                              onChange={() => toggleFilter(category.name, item.id)}
                              className="w-[1.04vw] h-[1.04vw] accent-[#91f9d0]"
                            />
                            <span className="font-['Satoshi_Variable:Medium',sans-serif] text-[0.94vw] text-[#000001]">
                              {item.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

          {/* Center - 3D Canvas */}
        <div className="flex-1 relative bg-[#fafafa]">
          <div className="absolute top-[1.04vw] left-[1.04vw] z-10">
            <h1 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.56vw] text-[#000001]">
              {projectTitle}
            </h1>
          </div>

          {activePointCloudUrl && (
            <div className="absolute top-[4.8vw] right-[1.04vw] z-10 bg-white/90 border border-[#d7d7d7] rounded-[0.78vw] px-[0.78vw] py-[0.62vw] shadow-sm">
              <p className="font-['Satoshi_Variable:Bold',sans-serif] text-[0.83vw] text-[#000001] mb-[0.52vw]">
                Point Cloud Colors
              </p>
              <p className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.68vw] text-[#666666] mb-[0.52vw]">
                {resolvedTab?.key === 'bim'
                    ? 'Instanced cloud under BIM overlay'
                    : 'Instanced class legend'}
              </p>
              <div className="grid grid-cols-2 gap-x-[1.04vw] gap-y-[0.42vw]">
                {pointCloudLegend.map((item) => (
                  <div key={`${item.name}-${item.color}`} className="flex items-center gap-[0.42vw]">
                    <span className="inline-block size-[0.68vw] rounded-full border border-[#cccccc]" style={{ backgroundColor: item.color }} />
                    <span className="font-['Satoshi_Variable:Medium',sans-serif] text-[0.73vw] text-[#000001]">
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="absolute bottom-[1.56vw] right-[1.56vw] flex flex-col gap-[0.52vw] z-10">
            <button
              onClick={() => setZoomCommand({ type: 'in', nonce: Date.now() })}
              className="bg-white border border-[#d7d7d7] p-[0.78vw] rounded-[0.52vw] hover:bg-[#f5f5f5] transition-colors"
            >
              <ZoomIn className="w-[1.25vw] h-[1.25vw]" />
            </button>
            <button
              onClick={() => setZoomCommand({ type: 'out', nonce: Date.now() })}
              className="bg-white border border-[#d7d7d7] p-[0.78vw] rounded-[0.52vw] hover:bg-[#f5f5f5] transition-colors"
            >
              <ZoomOut className="w-[1.25vw] h-[1.25vw]" />
            </button>
          </div>

          {availableTabs.length > 1 && (
            <div className="absolute top-[3.2vw] left-[1.04vw] z-10 flex gap-[0.42vw] bg-white/90 border border-[#d7d7d7] rounded-[0.78vw] p-[0.42vw] shadow-sm">
              {availableTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-[0.78vw] py-[0.42vw] rounded-[0.52vw] text-[0.78vw] font-['Satoshi_Variable:Medium',sans-serif] transition-colors ${
                    resolvedTab?.key === tab.key
                      ? 'bg-[#91f9d0] text-[#000001]'
                      : 'bg-white text-[#333333] hover:bg-[#f5f5f5]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <ViewCube activePreset={viewPreset} onSelect={setViewPreset} />

          {/* Three.js Container */}
          <div ref={canvasContainerRef} className="w-full h-full">
            <ThreeScene
              filters={filters}
              containerRef={canvasContainerRef}
              pointCloudUrl={activePointCloudUrl}
              bimModelUrl={activeBimModelUrl}
              viewPreset={viewPreset}
              zoomCommand={zoomCommand}
              elementVisibility={elementVisibility}
              viewMode={resolvedTab?.key || 'instanced'}
              onBimSelect={resolvedTab?.key === 'bim' ? handleBimSelect : undefined}
            />
          </div>
        </div>

        {/* Right Sidebar - Element Properties */}
        <div className="w-[20.83vw] bg-[#f5f5f5] border-l border-[#d7d7d7] overflow-y-auto">
          <div className="p-[1.56vw]">
            <div className="mb-[1.56vw] rounded-[0.78vw] border border-[#d7d7d7] bg-white p-[1.04vw]">
              <h2 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001] mb-[0.42vw]">
                Download Output
              </h2>
              <p className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.83vw] text-[#666666] mb-[0.83vw]">
                Download the generated IFC model for external BIM workflows.
              </p>
              {bimIfcUrl ? (
                <a
                  href={bimIfcUrl}
                  download
                  className="inline-flex w-full items-center justify-center rounded-[0.62vw] bg-[#91f9d0] px-[0.94vw] py-[0.72vw] font-['Satoshi_Variable:Bold',sans-serif] text-[0.88vw] text-[#000001] transition-colors hover:bg-[#7ee6bc]"
                >
                  Download IFC
                </a>
              ) : (
                <div className="rounded-[0.62vw] bg-[#f5f5f5] px-[0.94vw] py-[0.72vw] font-['Satoshi_Variable:Medium',sans-serif] text-[0.83vw] text-[#666666]">
                  IFC file unavailable for this project.
                </div>
              )}
            </div>

            <h2 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.25vw] text-[#000001] mb-[1.56vw]">
              Element Properties
            </h2>

            {selectedElement ? (
              <div className="space-y-[1.04vw]">
                <div>
                  <h3 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001] mb-[0.52vw]">
                    Element Type
                  </h3>
                  <p className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.94vw] text-[#666666]">
                    {selectedElement.type}
                  </p>
                </div>

                <div>
                  <h3 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001] mb-[0.52vw]">
                    Dimensions
                  </h3>
                  <p className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.94vw] text-[#666666]">
                    {selectedElement.dimensions}
                  </p>
                </div>

                <div className="border-t border-[#d7d7d7] pt-[1.04vw]">
                  <h3 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001] mb-[0.78vw]">
                    Properties
                  </h3>
                  <div className="space-y-[0.78vw]">
                    {selectedElement.properties.map((prop, index) => (
                      <div key={index} className="flex justify-between">
                        <span className="font-['Satoshi_Variable:Medium',sans-serif] text-[0.83vw] text-[#000001]">
                          {prop.label}:
                        </span>
                        <span className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.83vw] text-[#666666]">
                          {prop.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <p className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.94vw] text-[#666666]">
                Click on an element in the 3D view to see its properties
              </p>
            )}</div>
        </div>
      </div>
    </div>
  );
}
