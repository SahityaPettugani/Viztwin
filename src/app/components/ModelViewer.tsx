import { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { StandardizedHeaderS } from '../../imports/SharedHeader';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

interface ModelViewerProps {
  projectTitle: string;
  onClose: () => void;
  onNavigateHome: () => void;
  onNavigateGetStarted: () => void;
  onNavigateLibrary: () => void;
  pointCloudUrl?: string;
}

interface FilterCategory {
  name: string;
  items: { name: string; enabled: boolean }[];
}

interface SelectedElement {
  type: string;
  material: string;
  dimensions: string;
  properties: { label: string; value: string }[];
}

function ThreeScene({ 
  filters, 
  containerRef, 
  pointCloudUrl 
}: { 
  filters: FilterCategory[]; 
  containerRef: React.RefObject<HTMLDivElement>;
  pointCloudUrl?: string;
}) {
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Simple mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      
      camera.position.x -= deltaX * 0.02;
      camera.position.y += deltaY * 0.02;
      camera.lookAt(0, 0, 0);
      
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    
    const handleMouseUp = () => {
      isDragging = false;
    };
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      camera.position.multiplyScalar(factor);
    };
    
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('wheel', handleWheel);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight1.position.set(10, 10, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xe8e9eb);
    scene.add(gridHelper);

    // Create room elements array (used for cleanup)
    const roomElements: THREE.Mesh[] = [];

    // If we have a point cloud URL, load and display it
    if (pointCloudUrl) {
      const loader = new PLYLoader();
      loader.load(
        pointCloudUrl,
        (geometry) => {
          // Center the geometry
          geometry.computeBoundingBox();
          const boundingBox = geometry.boundingBox;
          if (boundingBox) {
            const center = new THREE.Vector3();
            boundingBox.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);
            
            // Scale to reasonable size
            const size = new THREE.Vector3();
            boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 5 / maxDim;
            geometry.scale(scale, scale, scale);
          }

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
          
          // Create point cloud material
          const material = new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            sizeAttenuation: true
          });
          
          // Create points object
          const points = new THREE.Points(geometry, material);
          scene.add(points);
          
          // Adjust camera position based on point cloud
          camera.position.set(8, 6, 8);
          camera.lookAt(0, 0, 0);
        },
        (progress) => {
          console.log('Loading point cloud:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
        },
        (error) => {
          console.error('Error loading point cloud:', error);
        }
      );
    } else {
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
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        scene.add(floor);
        roomElements.push(floor);
      }

      // Walls
      if (isEnabled('Structure', 'Walls')) {
        // Back wall
        const backWallGeometry = new THREE.BoxGeometry(10, 3, 0.2);
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e9eb });
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, 1.5, -5);
        scene.add(backWall);
        roomElements.push(backWall);

        // Left wall
        const leftWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 3, 10),
          new THREE.MeshStandardMaterial({ color: 0xe8e9eb })
        );
        leftWall.position.set(-5, 1.5, 0);
        scene.add(leftWall);
        roomElements.push(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 3, 10),
          new THREE.MeshStandardMaterial({ color: 0xe8e9eb })
        );
        rightWall.position.set(5, 1.5, 0);
        scene.add(rightWall);
        roomElements.push(rightWall);
      }

      // Ceiling
      if (isEnabled('Structure', 'Ceilings')) {
        const ceilingGeometry = new THREE.PlaneGeometry(10, 10);
        const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 3;
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
        window1.position.set(-2, 2, -4.95);
        scene.add(window1);
        roomElements.push(window1);

        const window2 = new THREE.Mesh(windowGeometry, windowMaterial.clone());
        window2.position.set(2, 2, -4.95);
        scene.add(window2);
        roomElements.push(window2);
      }

      // Door
      if (isEnabled('Architecture', 'Doors')) {
        const doorGeometry = new THREE.BoxGeometry(1.2, 2.5, 0.1);
        const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6f47 });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(4.95, 1.25, 2);
        scene.add(door);
        roomElements.push(door);
      }

      // Columns
      if (isEnabled('Structure', 'Columns')) {
        const columnGeometry = new THREE.BoxGeometry(0.4, 3, 0.4);
        const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        
        const column1 = new THREE.Mesh(columnGeometry, columnMaterial);
        column1.position.set(-3, 1.5, -3);
        scene.add(column1);
        roomElements.push(column1);

        const column2 = new THREE.Mesh(columnGeometry, columnMaterial.clone());
        column2.position.set(3, 1.5, -3);
        scene.add(column2);
        roomElements.push(column2);
      }

      // Beams
      if (isEnabled('Structure', 'Beams')) {
        const beamGeometry = new THREE.BoxGeometry(10, 0.3, 0.3);
        const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.set(0, 2.85, -3);
        scene.add(beam);
        roomElements.push(beam);
      }
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

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
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      roomElements.forEach(mesh => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      });
    };
  }, [filters, pointCloudUrl]);

  return null;
}

export default function ModelViewer({
  projectTitle,
  onClose,
  onNavigateHome,
  onNavigateGetStarted,
  onNavigateLibrary,
  pointCloudUrl
}: ModelViewerProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  const [filters, setFilters] = useState<FilterCategory[]>([
    {
      name: 'Structure',
      items: [
        { name: 'Walls', enabled: true },
        { name: 'Ceilings', enabled: true },
        { name: 'Floors', enabled: true },
        { name: 'Columns', enabled: true },
        { name: 'Beams', enabled: true },
      ]
    },
    {
      name: 'Architecture',
      items: [
        { name: 'Windows', enabled: true },
        { name: 'Doors', enabled: true },
        { name: 'Stairs', enabled: false },
      ]
    }
  ]);

  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>({
    type: 'Wall',
    material: 'Concrete',
    dimensions: '10m × 3m × 0.2m',
    properties: [
      { label: 'Material', value: 'Concrete' },
      { label: 'Thickness', value: '200mm' },
      { label: 'Finish', value: 'Painted' },
      { label: 'Fire Rating', value: '2 hours' },
      { label: 'Acoustic Rating', value: '45dB' },
    ]
  });

  const pointCloudLegend = [
    { name: 'Ceiling', color: 'rgb(31, 119, 180)' },
    { name: 'Floor', color: 'rgb(174, 199, 232)' },
    { name: 'Wall', color: 'rgb(255, 127, 14)' },
    { name: 'Beam', color: 'rgb(255, 187, 120)' },
    { name: 'Column', color: 'rgb(44, 160, 44)' },
    { name: 'Window', color: 'rgb(152, 223, 138)' },
    { name: 'Door', color: 'rgb(214, 39, 40)' },
    { name: 'Unknown', color: 'rgb(255, 152, 150)' },
  ];

  const toggleFilter = (categoryName: string, itemName: string) => {
    setFilters(prev => prev.map(category => {
      if (category.name === categoryName) {
        return {
          ...category,
          items: category.items.map(item =>
            item.name === itemName ? { ...item, enabled: !item.enabled } : item
          )
        };
      }
      return category;
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
      />

      <div className="flex h-screen pt-[8.8vw]">
        {/* Left Sidebar - Filters */}
        <div className="w-[18.75vw] bg-[#f5f5f5] border-r border-[#d7d7d7] overflow-y-auto">
          <div className="p-[1.56vw]">
            <div className="flex items-center justify-between mb-[1.04vw]">
              <h2 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.25vw] text-[#000001]">Layers</h2>
              <button onClick={onClose} className="p-[0.52vw] hover:bg-[#e8e9eb] rounded-[0.52vw] transition-colors">
                <X className="w-[1.25vw] h-[1.25vw]" />
              </button>
            </div>

            {filters.map((category) => (
              <div key={category.name} className="mb-[1.56vw]">
                <h3 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001] mb-[0.52vw]">
                  {category.name}
                </h3>
                <div className="space-y-[0.52vw]">
                  {category.items.map((item) => (
                    <label key={item.name} className="flex items-center gap-[0.52vw] cursor-pointer hover:bg-[#e8e9eb] p-[0.52vw] rounded-[0.52vw] transition-colors">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => toggleFilter(category.name, item.name)}
                        className="w-[1.04vw] h-[1.04vw] accent-[#91f9d0]"
                      />
                      <span className="font-['Satoshi_Variable:Medium',sans-serif] text-[0.94vw] text-[#000001]">
                        {item.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center - 3D Canvas */}
        <div className="flex-1 relative bg-[#fafafa]">
          <div className="absolute top-[1.04vw] left-[1.04vw] z-10">
            <h1 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.56vw] text-[#000001]">
              {projectTitle}
            </h1>
          </div>

          {pointCloudUrl && (
            <div className="absolute top-[1.04vw] right-[1.04vw] z-10 bg-white/90 border border-[#d7d7d7] rounded-[0.78vw] px-[0.78vw] py-[0.62vw] shadow-sm">
              <p className="font-['Satoshi_Variable:Bold',sans-serif] text-[0.83vw] text-[#000001] mb-[0.52vw]">
                Semantic Class Colors
              </p>
              <p className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.68vw] text-[#666666] mb-[0.52vw]">
                Instance colors may vary per object
              </p>
              <div className="grid grid-cols-2 gap-x-[1.04vw] gap-y-[0.42vw]">
                {pointCloudLegend.map((item) => (
                  <div key={item.name} className="flex items-center gap-[0.42vw]">
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
            <button className="bg-white border border-[#d7d7d7] p-[0.78vw] rounded-[0.52vw] hover:bg-[#f5f5f5] transition-colors">
              <ZoomIn className="w-[1.25vw] h-[1.25vw]" />
            </button>
            <button className="bg-white border border-[#d7d7d7] p-[0.78vw] rounded-[0.52vw] hover:bg-[#f5f5f5] transition-colors">
              <ZoomOut className="w-[1.25vw] h-[1.25vw]" />
            </button>
            <button className="bg-white border border-[#d7d7d7] p-[0.78vw] rounded-[0.52vw] hover:bg-[#f5f5f5] transition-colors">
              <Maximize2 className="w-[1.25vw] h-[1.25vw]" />
            </button>
          </div>

          {/* Three.js Container */}
          <div ref={canvasContainerRef} className="w-full h-full">
            <ThreeScene filters={filters} containerRef={canvasContainerRef} pointCloudUrl={pointCloudUrl} />
          </div>
        </div>

        {/* Right Sidebar - Material Properties */}
        <div className="w-[20.83vw] bg-[#f5f5f5] border-l border-[#d7d7d7] overflow-y-auto">
          <div className="p-[1.56vw]">
            <h2 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.25vw] text-[#000001] mb-[1.56vw]">
              Material Properties
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

                <div className="border-t border-[#d7d7d7] pt-[1.04vw]">
                  <h3 className="font-['Satoshi_Variable:Bold',sans-serif] text-[1.04vw] text-[#000001] mb-[0.52vw]">
                    Material Preview
                  </h3>
                  <div className="w-full h-[8.33vw] bg-[#cccccc] rounded-[0.52vw] flex items-center justify-center">
                    <span className="font-['Satoshi_Variable:Regular',sans-serif] text-[0.83vw] text-[#666666]">
                      {selectedElement.material}
                    </span>
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