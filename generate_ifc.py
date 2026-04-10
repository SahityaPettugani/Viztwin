import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.date
import ifcopenshell.util.unit
import ifcopenshell.util.element
import ifcopenshell.util.placement
import datetime
import uuid
import math


class IFCmodel:
    def _cartesian_point(self, coords):
        return self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=tuple(float(v) for v in coords))

    def _direction(self, ratios):
        return self.ifc_file.create_entity("IfcDirection", DirectionRatios=tuple(float(v) for v in ratios))

    def _axis2placement3d(self, location=(0.0, 0.0, 0.0), axis=(0.0, 0.0, 1.0), ref_direction=(1.0, 0.0, 0.0)):
        return self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self._cartesian_point(location),
            Axis=self._direction(axis),
            RefDirection=self._direction(ref_direction),
        )

    def _axis2placement2d(self, location=(0.0, 0.0), ref_direction=(1.0, 0.0)):
        return self.ifc_file.create_entity(
            "IfcAxis2Placement2D",
            Location=self._cartesian_point(location),
            RefDirection=self._direction(ref_direction),
        )

    def _local_placement(self, location=(0.0, 0.0, 0.0), axis=(0.0, 0.0, 1.0), ref_direction=(1.0, 0.0, 0.0), relative_to=None):
        return self.ifc_file.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=relative_to,
            RelativePlacement=self._axis2placement3d(location, axis, ref_direction),
        )

    def _closed_profile_from_points(self, points_2d, profile_name="Profile"):
        if not points_2d or len(points_2d) < 3:
            raise ValueError(f"{profile_name} requires at least 3 points.")
        pts = [self._cartesian_point((float(x), float(y))) for x, y in points_2d]
        if points_2d[0] != points_2d[-1]:
            pts.append(self._cartesian_point((float(points_2d[0][0]), float(points_2d[0][1]))))
        return self.ifc_file.create_entity(
            "IfcArbitraryClosedProfileDef",
            ProfileType="AREA",
            ProfileName=profile_name,
            OuterCurve=self.ifc_file.create_entity("IfcPolyline", Points=pts),
        )

    def _shape_representation(self, items, context=None, identifier="Body", rep_type="SweptSolid"):
        return self.ifc_file.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=context or self.geom_rep_sub_context,
            RepresentationIdentifier=identifier,
            RepresentationType=rep_type,
            Items=items,
        )

    def _product_definition_shape(self, *representations):
        reps = [rep for rep in representations if rep is not None]
        return self.ifc_file.create_entity("IfcProductDefinitionShape", Representations=reps)

    def _polygon_origin_and_local_points(self, points):
        if len(points) < 3:
            raise ValueError("Polygon requires at least 3 points.")
        origin_x, origin_y = float(points[0][0]), float(points[0][1])
        local_points = [(float(x) - origin_x, float(y) - origin_y) for x, y in points]
        return (origin_x, origin_y), local_points

    def _material_entity(self, material_name):
        return self.ifc_file.create_entity("IfcMaterial", Name=material_name)

    def _associate_simple_material(self, product, material_name):
        self.ifc_file.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            RelatedObjects=[product],
            RelatingMaterial=self._material_entity(material_name),
        )

    def _create_extruded_polygon_solid(self, polygon_points, depth, profile_name="Profile"):
        profile = self._closed_profile_from_points(polygon_points, profile_name=profile_name)
        solid = self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=self._axis2placement3d(),
            ExtrudedDirection=self._direction((0.0, 0.0, 1.0)),
            Depth=float(depth),
        )
        return solid

    def _create_rect_solid(self, x_dim, y_dim, depth, center=(0.0, 0.0)):
        profile = self.ifc_file.create_entity(
            "IfcRectangleProfileDef",
            ProfileType="AREA",
            Position=self._axis2placement2d(location=center),
            XDim=float(x_dim),
            YDim=float(y_dim),
        )
        return self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=self._axis2placement3d(),
            ExtrudedDirection=self._direction((0.0, 0.0, 1.0)),
            Depth=float(depth),
        )

    def create_ceiling(self, ceiling_name, points, z_elev, height, material_name):
        origin, local_points = self._polygon_origin_and_local_points(points)
        ceiling_placement = self._local_placement(
            location=(origin[0], origin[1], float(z_elev)),
            relative_to=self.building.ObjectPlacement,
        )
        ceiling_solid = self._create_extruded_polygon_solid(local_points, height, profile_name="Ceiling perimeter")
        product_definition_shape = self._product_definition_shape(
            self._shape_representation([ceiling_solid], context=self.geom_rep_sub_context)
        )
        ifc_ceiling = self.ifc_file.create_entity(
            "IfcCovering",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=ceiling_name,
            ObjectType="Ceiling",
            ObjectPlacement=ceiling_placement,
            Representation=product_definition_shape,
            PredefinedType="CEILING"
        )
        self._associate_simple_material(ifc_ceiling, material_name)
        return ifc_ceiling

    def create_column(self, name, center_pt, z_elev, height, radius=0.2):
        """Creates an IfcColumn as a cylindrical extrusion."""
        placement = self._local_placement(
            location=(float(center_pt[0]), float(center_pt[1]), float(z_elev)),
            relative_to=self.building.ObjectPlacement,
        )
        profile = self.ifc_file.create_entity(
            "IfcCircleProfileDef",
            ProfileType="AREA",
            ProfileName=f"{name}_profile",
            Position=self._axis2placement2d(),
            Radius=float(radius),
        )
        extrusion = self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=self._axis2placement3d(),
            ExtrudedDirection=self._direction((0.0, 0.0, 1.0)),
            Depth=float(height),
        )
        product_shape = self._product_definition_shape(
            self._shape_representation([extrusion], context=self.geom_rep_sub_context)
        )
        column = self.ifc_file.create_entity(
            "IfcColumn",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=name,
            ObjectPlacement=placement,
            Representation=product_shape,
        )
        return column

    def create_beam(self, name, points, z_elev, height, thickness=0.2):
        """Creates an IfcBeam by extruding a profile along the path between two points."""
        start_pt = points[0]
        end_pt = points[1]
        
        # Calculate length and rotation
        dx, dy = end_pt[0] - start_pt[0], end_pt[1] - start_pt[1]
        length = math.sqrt(dx**2 + dy**2)
        angle = math.atan2(dy, dx)

        # Placement
        placement = self._local_placement(
            location=(float(start_pt[0]), float(start_pt[1]), float(z_elev)),
            ref_direction=(math.cos(angle), math.sin(angle), 0.0),
            relative_to=self.building.ObjectPlacement,
        )

        # Rectangular profile (Thickness x Height) extruded along the length
        extrusion = self._create_rect_solid(length, thickness, height, center=(length / 2.0, 0.0))
        product_shape = self._product_definition_shape(
            self._shape_representation([extrusion], context=self.geom_rep_sub_context)
        )
        beam = self.ifc_file.create_entity(
            "IfcBeam",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=name,
            ObjectPlacement=placement,
            Representation=product_shape,
        )
        return beam

    def create_door(self, name, geometry):
        """Creates an IfcDoor based on bounding box geometry."""
        z_pos = float(geometry.get('start_z', 0.0))
        height = float(geometry.get('height', 2.1))
        width = math.sqrt((geometry['end_x'] - geometry['start_x'])**2 + (geometry['end_y'] - geometry['start_y'])**2)
        thickness = float(geometry.get("thickness", 0.1))
        angle = math.atan2(float(geometry['end_y']) - float(geometry['start_y']), float(geometry['end_x']) - float(geometry['start_x']))
        placement = self._local_placement(
            location=(float(geometry['start_x']), float(geometry['start_y']), z_pos),
            ref_direction=(math.cos(angle), math.sin(angle), 0.0),
            relative_to=self.building.ObjectPlacement,
        )
        body = self._create_rect_solid(width, thickness, height, center=(width / 2.0, 0.0))
        shape = self._product_definition_shape(
            self._shape_representation([body], context=self.geom_rep_sub_context)
        )
        door = self.ifc_file.create_entity(
            "IfcDoor",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=name,
            OverallHeight=height,
            OverallWidth=width,
            ObjectPlacement=placement,
            Representation=shape,
        )
        return door

    def create_window(self, name, geometry):
        """Creates an IfcWindow based on bounding box geometry."""
        z_pos = float(geometry.get('start_z', 0.0))
        height = float(geometry.get('height', 1.2))
        width = math.sqrt((geometry['end_x'] - geometry['start_x'])**2 + (geometry['end_y'] - geometry['start_y'])**2)
        thickness = float(geometry.get("thickness", 0.1))
        angle = math.atan2(float(geometry['end_y']) - float(geometry['start_y']), float(geometry['end_x']) - float(geometry['start_x']))
        placement = self._local_placement(
            location=(float(geometry['start_x']), float(geometry['start_y']), z_pos),
            ref_direction=(math.cos(angle), math.sin(angle), 0.0),
            relative_to=self.building.ObjectPlacement,
        )
        body = self._create_rect_solid(width, thickness, height, center=(width / 2.0, 0.0))
        shape = self._product_definition_shape(
            self._shape_representation([body], context=self.geom_rep_sub_context)
        )
        window = self.ifc_file.create_entity(
            "IfcWindow",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=name,
            OverallHeight=height,
            OverallWidth=width,
            ObjectPlacement=placement,
            Representation=shape,
        )
        return window

    def __init__(self, project_name, output_file):
        self.project_name = project_name
        self.output_file = output_file
        self.project_description = ''
        self.object_type = ''
        self.long_project_name = ''
        self.construction_phase = ''
        self.author_name = ''
        self.author_organization = ''  # model author's organization
        self.organization = ''  # owner of the model or structure
        self.version = ''
        self.person_given_name = ''
        self.person_family_name = ''
        self.site_latitude = ''
        self.site_longitude = ''
        self.site_elevation = ''

        # Create a new IFC file and add header data
        self.ifc_file = ifcopenshell.file()
        self.ifc_file.header.file_description.description = ('ViewDefinition [DesignTransferView_V1.0]',)  # IFC schema subsets to describe data exchange for a specific use or workflow
        self.ifc_file.header.file_name.name = self.output_file
        self.ifc_file.header.file_name.time_stamp = ifcopenshell.util.date.datetime2ifc(datetime.datetime.now(), "IfcDateTime")
        self.ifc_file.header.file_name.author = (self.author_name,)
        self.ifc_file.header.file_name.organization = (self.author_organization,)
        self.ifc_file.header.file_name.preprocessor_version = 'IfcOpenShell {0}'.format(ifcopenshell.version)  # define the program used for IFC file creation
        self.ifc_file.header.file_name.originating_system = 'Cloud2BIM'
        self.ifc_file.header.file_name.authorization = 'None'

    def define_author_information(self, author_name, author_organization):
        self.author_name = author_name
        self.author_organization = author_organization
        self.ifc_file.header.file_name.author = (self.author_name,)
        self.ifc_file.header.file_name.organization = (self.author_organization,)

    def create_unit_assignment(self):
        """Create a unit assignment for the project."""
        # Define length, area, volume and angle units (SI units are used here)
        length_unit = self.ifc_file.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Name="METRE")
        area_unit = self.ifc_file.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE")
        volume_unit = self.ifc_file.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE")
        plane_angle_unit = self.ifc_file.create_entity("IfcSIUnit", UnitType="PLANEANGLEUNIT", Name="RADIAN")
        solid_angle_unit = self.ifc_file.create_entity("IfcSIUnit", UnitType="SOLIDANGLEUNIT", Name="STERADIAN")

        # Define a unit assignment with these units
        unit_assignment = self.ifc_file.create_entity(
            "IfcUnitAssignment",
            Units=[length_unit, area_unit, volume_unit, plane_angle_unit, solid_angle_unit]
        )

        return unit_assignment

    def assign_material(self, product, material):
        associated_material = self.ifc_file.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            RelatingMaterial=material,
            RelatedObjects=[product]
        )
        return associated_material

    def define_project_data(self, project_description, object_type, long_project_name, construction_phase, version,
                            organization, person_given_name, person_family_name, latitude, longitude, elevation):
        self.project_description = project_description
        self.person_given_name = person_given_name
        self.person_family_name = person_family_name
        self.object_type = object_type
        self.long_project_name = long_project_name
        self.construction_phase = construction_phase
        self.version = version
        self.organization = organization
        self.site_latitude = latitude
        self.site_longitude = longitude
        self.site_elevation = elevation

        # Define a unit assignment
        unit_assignment = self.create_unit_assignment()

        # Inception of coordination system - related to World coordinate system
        axis_placement = self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
        )

        # Define geometric context (swept-solid objects)
        self.context = self.ifc_file.create_entity(
            "IfcGeometricRepresentationContext",
            ContextIdentifier="Body",
            ContextType="Model",
            CoordinateSpaceDimension=3,
            Precision=0.0001,
            WorldCoordinateSystem=axis_placement
        )

        # Create geometric representation sub-context (swept-solid objects)
        self.geom_rep_sub_context = self.ifc_file.create_entity(
            "IfcGeometricRepresentationSubContext",
            ParentContext=self.context,
            ContextIdentifier="Body",
            ContextType="Model",
            TargetScale=None,
            TargetView="MODEL_VIEW",
            UserDefinedTargetView=None
        )

        # Create geometric representation sub-context (swept-solid objects)
        self.geom_rep_sub_context_walls = self.ifc_file.create_entity(
            "IfcGeometricRepresentationSubContext",
            ParentContext=self.context,
            ContextIdentifier='Axis',
            ContextType="Model",
            TargetScale=None,
            TargetView="MODEL_VIEW",
            UserDefinedTargetView=None
        )

        # Set up the project structure
        self.project = self.ifc_file.create_entity(
            "IfcProject",
            GlobalId=ifcopenshell.guid.new(),
            Name=self.project_name,
            LongName=self.long_project_name,
            ObjectType=self.object_type,
            Description=self.project_description,
            Phase=self.construction_phase,
            UnitsInContext=unit_assignment,  # use the created unit assignment here
        )

        # Create the organization entity
        self.organization_entity = self.ifc_file.create_entity("IfcOrganization",
                                                               Name=self.organization
                                                               )

        # Set the application information
        self.application = self.ifc_file.create_entity("IfcApplication",
                                                       ApplicationDeveloper=self.organization_entity,
                                                       Version=self.version,
                                                       ApplicationFullName=self.project_name,
                                                       ApplicationIdentifier="MY_IFC_APP"
                                                       )

        # Create the person entity
        self.person_entity = self.ifc_file.create_entity("IfcPerson",
                                                         FamilyName=self.person_family_name,
                                                         GivenName=self.person_given_name
                                                         )

        # Create the person and organization entity
        self.person_and_organization_entity = self.ifc_file.create_entity("IfcPersonAndOrganization",
                                                                          ThePerson=self.person_entity,
                                                                          TheOrganization=self.ifc_file.by_type("IfcOrganization")[0]
                                                                          )

        # Create an owner history
        self.owner_history = self.ifc_file.create_entity("IfcOwnerHistory",
                                                         OwningUser=self.person_and_organization_entity,
                                                         OwningApplication=self.application,
                                                         ChangeAction="NOTDEFINED",
                                                         CreationDate=ifcopenshell.util.date.datetime2ifc(datetime.datetime.now(), "IfcTimeStamp"),
                                                         )

        # Create the site
        self.site = self.ifc_file.create_entity("IfcSite",
                                                GlobalId=ifcopenshell.guid.new(),
                                                OwnerHistory=self.owner_history,
                                                Name="Site",
                                                CompositionType="ELEMENT",
                                                RefLatitude=self.site_latitude,
                                                RefLongitude=self.site_longitude,
                                                RefElevation=self.site_elevation
                                                )

        # relationship between the IfcProject and IfcSite entities
        self.rel_aggregates_project = self.ifc_file.createIfcRelAggregates(
            ifcopenshell.guid.compress(uuid.uuid1().hex),
            self.owner_history,
            "$",
            "$",
            self.project,
            (self.site,)
        )

        # Inception of coordination system - related to building
        axis_placement_building = self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
        )

        building_placement = self.ifc_file.create_entity(
            "IfcLocalPlacement",
            RelativePlacement=axis_placement_building
        )

        # Create the building
        self.building = self.ifc_file.create_entity("IfcBuilding",
                                                    GlobalId=ifcopenshell.guid.new(),
                                                    OwnerHistory=self.owner_history,
                                                    Name="Building",
                                                    ObjectType="IfcBuilding",
                                                    ObjectPlacement=building_placement,
                                                    CompositionType="ELEMENT",
                                                    ElevationOfRefHeight=self.site_elevation
                                                    )

        # Create IfcRelAggregates entities to connect the site and the building
        self.ifc_file.create_entity("IfcRelAggregates",
                                    GlobalId=ifcopenshell.guid.new(),
                                    OwnerHistory=self.owner_history,
                                    RelatingObject=self.site,
                                    RelatedObjects=[self.building]
                                    )

    def create_building_storey(self, storey_name, storey_elevation):
        storey_placement = self._local_placement(
            location=(0.0, 0.0, float(storey_elevation)),
            relative_to=self.building.ObjectPlacement,
        )

        # Create building storey
        building_storey = self.ifc_file.create_entity("IfcBuildingStorey",
                                                      GlobalId=ifcopenshell.guid.new(),
                                                      OwnerHistory=self.owner_history,
                                                      Name=storey_name,
                                                      Elevation=storey_elevation,
                                                      CompositionType="ELEMENT",
                                                      ObjectPlacement=storey_placement
                                                      )

        # relationship between IfcBuilding and IfcBuildingStorey
        self.ifc_file.create_entity("IfcRelAggregates",
                                    GlobalId=ifcopenshell.guid.new(),
                                    OwnerHistory=self.owner_history,
                                    RelatingObject=self.building,
                                    RelatedObjects=[building_storey]
                                    )
        return building_storey

    def create_slab(self, slab_name, points, slab_z_position, slab_height, material_name):
        origin, local_points = self._polygon_origin_and_local_points(points)
        slab_placement = self._local_placement(
            location=(origin[0], origin[1], float(slab_z_position)),
            relative_to=self.building.ObjectPlacement,
        )
        slab_extrusion = self._create_extruded_polygon_solid(local_points, slab_height, profile_name="Slab perimeter")
        slab = self.ifc_file.create_entity(
            "IfcSlab",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=slab_name,
            ObjectType="base",
            ObjectPlacement=slab_placement,
            Representation=self._product_definition_shape(
                self._shape_representation([slab_extrusion], context=self.geom_rep_sub_context)
            ),
        )
        self._associate_simple_material(slab, material_name)
        return slab

    def assign_product_to_storey(self, product, storey):
        product_name = product.Name
        self.ifc_file.create_entity(
            "IfcRelContainedInSpatialStructure",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=product_name,
            Description="Storey container for elements",
            RelatedElements=[product],
            RelatingStructure=storey
        )

    def create_wall_element(self, name, start_point, end_point, z_placement, wall_height, wall_thickness, material_name, openings=None):
        dx = float(end_point[0] - start_point[0])
        dy = float(end_point[1] - start_point[1])
        length = math.sqrt(dx ** 2 + dy ** 2)
        if length <= 1e-6:
            raise ValueError(f"Wall {name} has zero length.")

        direction_x = dx / length
        direction_y = dy / length
        wall_placement = self._local_placement(
            location=(float(start_point[0]), float(start_point[1]), float(z_placement)),
            ref_direction=(direction_x, direction_y, 0.0),
            relative_to=self.building.ObjectPlacement,
        )

        axis_polyline = self.ifc_file.create_entity(
            "IfcPolyline",
            Points=[
                self._cartesian_point((0.0, 0.0)),
                self._cartesian_point((length, 0.0)),
            ],
        )
        axis_representation = self._shape_representation(
            [axis_polyline],
            context=self.geom_rep_sub_context_walls,
            identifier="Axis",
            rep_type="Curve2D",
        )

        body_solid = self._create_rect_solid(length, wall_thickness, wall_height, center=(length * 0.5, 0.0))
        body_representation = self._shape_representation(
            [body_solid],
            context=self.geom_rep_sub_context_walls,
            identifier="Body",
            rep_type="SweptSolid",
        )

        ifc_wall = self.ifc_file.create_entity(
            "IfcWallStandardCase",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=name,
            ObjectType="Wall",
            ObjectPlacement=wall_placement,
            Representation=self._product_definition_shape(axis_representation, body_representation),
            PredefinedType="STANDARD",
        )

        material_layer = self.create_material_layer(wall_thickness, material_name)
        material_layer_set = self.create_material_layer_set([material_layer], wall_thickness)
        material_layer_set_usage = self.create_material_layer_set_usage(material_layer_set, wall_thickness)
        self.assign_material(ifc_wall, material_layer_set_usage)

        wall_type = self.create_wall_type(ifc_wall, wall_thickness)
        self.assign_material(wall_type[0], material_layer_set)

        for opening in openings or []:
            self.create_wall_opening_from_ranges(
                ifc_wall=ifc_wall,
                wall_placement=wall_placement,
                wall_length=length,
                wall_thickness=wall_thickness,
                opening=opening,
            )

        return ifc_wall

    def create_wall_opening_from_ranges(self, ifc_wall, wall_placement, wall_length, wall_thickness, opening):
        x_start = float(opening["x_range_start"])
        x_end = float(opening["x_range_end"])
        z_min = float(opening["z_range_min"])
        z_max = float(opening["z_range_max"])
        if x_end <= x_start or z_max <= z_min:
            return None

        opening_width = x_end - x_start
        opening_height = z_max - z_min
        x_center = x_start + opening_width * 0.5
        profile = self._closed_profile_from_points(
            [
                (-opening_width * 0.5, -wall_thickness * 0.5),
                (-opening_width * 0.5, wall_thickness * 0.5),
                (opening_width * 0.5, wall_thickness * 0.5),
                (opening_width * 0.5, -wall_thickness * 0.5),
            ],
            profile_name="Opening perimeter",
        )
        opening_solid = self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=self._axis2placement3d(location=(x_center, 0.0, z_min)),
            ExtrudedDirection=self._direction((0.0, 0.0, 1.0)),
            Depth=opening_height,
        )
        opening_shape = self._product_definition_shape(
            self._shape_representation([opening_solid], context=self.geom_rep_sub_context)
        )
        opening_placement = self._local_placement(relative_to=wall_placement)
        opening_element = self.ifc_file.create_entity(
            "IfcOpeningElement",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=opening.get("id", "Opening"),
            ObjectPlacement=opening_placement,
            Representation=opening_shape,
            PredefinedType="OPENING",
        )
        self.create_rel_voids_element(ifc_wall, opening_element)

        opening_type = str(opening.get("type", "")).lower()
        if opening_type in {"door", "window"}:
            self.create_filling_element(opening_type, opening, opening_element, wall_placement, wall_thickness)
        return opening_element

    def create_filling_element(self, element_type, opening, opening_element, wall_placement, wall_thickness):
        x_start = float(opening["x_range_start"])
        x_end = float(opening["x_range_end"])
        z_min = float(opening["z_range_min"])
        z_max = float(opening["z_range_max"])
        width = x_end - x_start
        height = z_max - z_min
        thickness = float(opening.get("thickness", min(wall_thickness * 0.6, 0.12)))

        local_placement = self._local_placement(
            location=(x_start + width * 0.5, 0.0, z_min),
            relative_to=wall_placement,
        )
        body = self._create_rect_solid(width, thickness, height, center=(0.0, 0.0))
        shape = self._product_definition_shape(
            self._shape_representation([body], context=self.geom_rep_sub_context)
        )

        if element_type == "door":
            element = self.ifc_file.create_entity(
                "IfcDoor",
                GlobalId=ifcopenshell.guid.new(),
                OwnerHistory=self.owner_history,
                Name=opening.get("id", "Door"),
                ObjectPlacement=local_placement,
                Representation=shape,
                OverallHeight=height,
                OverallWidth=width,
            )
        else:
            element = self.ifc_file.create_entity(
                "IfcWindow",
                GlobalId=ifcopenshell.guid.new(),
                OwnerHistory=self.owner_history,
                Name=opening.get("id", "Window"),
                ObjectPlacement=local_placement,
                Representation=shape,
                OverallHeight=height,
                OverallWidth=width,
            )

        self.ifc_file.create_entity(
            "IfcRelFillsElement",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            RelatingOpeningElement=opening_element,
            RelatedBuildingElement=element,
        )
        return element

    # wall definition

    def create_material_layer(self, wall_thickness=0.3, material_name="Masonry - brick"):
        wall_thickness = float(wall_thickness)
        material_layer = self.ifc_file.create_entity(
            "IfcMaterialLayer",
            LayerThickness=wall_thickness,
            Name='Core',
            IsVentilated=".F.",
            Category='LoadBearing',
            Priority=99,
            Material=self.ifc_file.create_entity(
                "IfcMaterial",
                Name=material_name
            )
        )
        return material_layer

    def create_material_layer_set(self, material_layers=None, wall_thickness=0.3):
        wall_thickness = wall_thickness * 1000
        # Create an IfcMaterialLayerSet using the provided layers
        material_layer_set = self.ifc_file.create_entity(
            "IfcMaterialLayerSet",
            MaterialLayers=material_layers,
            LayerSetName='Concrete loadbearing wall - %d mm' % wall_thickness
        )

        return material_layer_set

    def create_material_layer_set_usage(self, material_layer_set, wall_thickness):
        wall_thickness = float(wall_thickness)
        # Create an IFCMaterialLayerSetUsage using the provided material layer set
        material_layer_set_usage = self.ifc_file.create_entity(
            "IfcMaterialLayerSetUsage",
            ForLayerSet=material_layer_set,
            LayerSetDirection='AXIS2',
            DirectionSense='POSITIVE',
            OffsetFromReferenceLine=-(wall_thickness / 2)  # Adjust the offset as needed
        )
        return material_layer_set_usage

    def wall_placement(self, z_placement):
        # Inception of coordination system - related to wall
        axis_placement_wall = self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, z_placement)),
            Axis=None,
            RefDirection=None
        )

        wall_placement = self.ifc_file.create_entity(
            "IfcLocalPlacement",
            RelativePlacement=axis_placement_wall
        )
        return wall_placement

    def wall_axis_placement(self, start_point=(0.0, 0.0), end_point=(5.0, 0.0)):
        # Convert points to IfcCartesianPoint instances
        start_cartesian_point = self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=start_point)
        end_cartesian_point = self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=end_point)

        # Create an IfcPolyline with the points
        wall_axis_polyline = self.ifc_file.create_entity(
            "IfcPolyline",
            Points=[start_cartesian_point, end_cartesian_point]
        )
        return wall_axis_polyline

    def wall_axis_representation(self, wall_axis_polyline):
        # Create an IfcShapeRepresentation for the wall
        wall_axis_representation = self.ifc_file.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=self.geom_rep_sub_context_walls,  # Replace with the appropriate context
            RepresentationIdentifier="Axis",
            RepresentationType="Curve2D",  # Use "Curve" as per your desired output
            Items=[wall_axis_polyline],  # Replace with the appropriate geometry items for the wall = IfcPolyline
        )
        return wall_axis_representation

    def wall_swept_solid_representation(self, start_point, end_point, wall_height, wall_thickness):
        wall_height = float(wall_height)
        wall_thickness = float(wall_thickness)
        # Create an IfcCartesianPoint for the reference point of the rectangle (center or any other point)
        rectangle_reference_point = self.ifc_file.create_entity("IfcCartesianPoint",
                                                                Coordinates=((start_point[0] + end_point[0]) / 2, (start_point[1] + end_point[1]) / 2)
                                                                )

        # Create an IfcAxis2Placement2D using the center point
        dx = end_point[0] - start_point[0]
        dy = end_point[1] - start_point[1]
        magnitude = math.sqrt(dx ** 2 + dy ** 2)
        direction_x = float(dx / magnitude)
        direction_y = float(dy / magnitude)
        axis_placement_2d = self.ifc_file.create_entity(
            "IfcAxis2Placement2D",
            Location=rectangle_reference_point,
            RefDirection=self.ifc_file.createIfcDirection((direction_x, direction_y))
        )

        # Create an IfcRectangleProfileDef with the specified attributes
        rectangle_profile = self.ifc_file.create_entity(
            "IfcRectangleProfileDef",
            ProfileType='AREA',
            ProfileName='Wall Perim',
            Position=axis_placement_2d,
            XDim=float(math.sqrt((end_point[0] - start_point[0]) ** 2 + (end_point[1] - start_point[1]) ** 2)),
            YDim=float(wall_thickness),  # Replace with the actual Y dimension
        )

        # Create an IfcExtrudedAreaSolid
        wall_extruded_area = self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=rectangle_profile,
            Position=None,
            ExtrudedDirection=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),  # direction of extrusion
            Depth=float(wall_height),  # Replace with the actual wall height
        )

        # Create an IfcShapeRepresentation for the wall
        wall_area_representation = self.ifc_file.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=self.geom_rep_sub_context_walls,  # Replace with the appropriate context
            RepresentationIdentifier='Body',
            RepresentationType='SweptSolid',
            Items=[wall_extruded_area],  # Replace with the appropriate geometry items for the wall
        )
        return rectangle_profile, wall_extruded_area, wall_area_representation

    def product_definition_shape(self, wall_axis_representation=None, wall_area_representation=None):
        product_definition_shape = self.ifc_file.create_entity(
            "IfcProductDefinitionShape",
            Representations=[wall_axis_representation, wall_area_representation[2]]
        )
        return product_definition_shape

    def create_wall(self, wall_placement, product_definition_shape):
        ifc_wall = self.ifc_file.create_entity(
            "IfcWall",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,  # Replace with your IfcOwnerHistory entity or None
            Name="Wall Name",  # Replace with your wall's name or None
            Description="Wall Description",  # Replace with your wall's description or None
            ObjectType="Wall",
            ObjectPlacement=wall_placement,  # Replace with your IfcLocalPlacement or IfcGridPlacement entity or None
            Representation=product_definition_shape,  # Replace with your IfcProductDefinitionShape entity or None
            Tag="Wall Tag",  # Replace with your wall's tag or None
            PredefinedType="STANDARD"  # Replace with your wall's predefined type or None
        )
        return ifc_wall

    def create_wall_type(self, ifc_wall, wall_thickness=0.3):
        wall_thickness = wall_thickness * 1000
        wall_type = self.ifc_file.create_entity(
            "IfcWallType",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name="Concrete 300",
            Description="Wall Load-bearing Concrete - thickness %d mm" % wall_thickness,
            ApplicableOccurrence=None,
            HasPropertySets=None,
            RepresentationMaps=None,  # Replace with your representation maps
            Tag="Wall Type Tag",  # Replace with your wall type's tag
            ElementType="Wall Type",  # A descriptive name for the element type
            PredefinedType="STANDARD"  # Replace with your wall type's predefined type
        )

        # Create the IfcRelDefinesByType relationship
        rel_defines_by_type = self.ifc_file.create_entity(
            "IfcRelDefinesByType",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=None,
            Description="Relation between Wall and WallType",
            RelatedObjects=[ifc_wall],
            RelatingType=wall_type,
        )

        rel_declares = self.ifc_file.create_entity(
            "IfcRelDeclares",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=None,
            Description=None,
            RelatingContext=self.project,
            RelatedDefinitions=[wall_type],
        )
        return wall_type, rel_defines_by_type, rel_declares

    # Wall opening definition

    def create_wall_opening(self, opening_placement, opening_representation):
        opening_standard_case = self.ifc_file.create_entity(
            "IfcOpeningElement",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name="Opening ID",
            Description="Wall opening",
            ObjectType=None,
            ObjectPlacement=opening_placement,
            Representation=opening_representation,
            Tag=None,
            PredefinedType="OPENING",
        )
        return opening_standard_case

    # opening placement
    def opening_placement(self, wall_start_point, wall_placement):
        # Inception of coordination system - related to wall
        axis_placement_window = self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(wall_start_point[0], wall_start_point[1], 0.0)),
            Axis=None,
            RefDirection=None
        )

        window_placement = self.ifc_file.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=wall_placement,
            RelativePlacement=axis_placement_window
        )
        return axis_placement_window, window_placement

    def opening_representation(self, opening_extrusion_represent):
        # Create an IfcShapeRepresentation for the opening
        opening_representation = self.ifc_file.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=self.context,
            RepresentationIdentifier='Body',
            RepresentationType='SweptSolid',
            Items=[opening_extrusion_represent],
        )
        return opening_representation

    def product_definition_shape_opening(self, opening_representation):
        product_definition_shape = self.ifc_file.create_entity(
            "IfcProductDefinitionShape",
            Representations=[opening_representation]
        )
        return product_definition_shape

    def opening_closed_profile_def(self, opening_width, wall_thickness):

        points = [(0.0, - wall_thickness / 2), (0.0, wall_thickness/2), (opening_width, wall_thickness / 2), (opening_width, - wall_thickness/2)]
        points = [(float(x), float(y)) for x, y in points]

        # Convert points to IfcCartesianPoint instances
        extrusion_points = [
            self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=point)
            for point in points
        ]

        polyline_profile_area = self.ifc_file.create_entity(
            "IfcArbitraryClosedProfileDef",
            ProfileType="AREA",
            ProfileName="Opening perimeter",
            OuterCurve=self.ifc_file.create_entity("IfcPolyline", Points=extrusion_points + [extrusion_points[0]])
        )
        return polyline_profile_area

    def opening_extrusion(self, polyline_profile_area, opening_height, start_point, end_point, opening_sill_height, offset_from_start):

        dx = end_point[0] - start_point[0]
        dy = end_point[1] - start_point[1]
        magnitude = math.sqrt(dx ** 2 + dy ** 2)
        direction_x = float(dx / magnitude)
        direction_y = float(dy / magnitude)

        opening_extrusion = self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=polyline_profile_area,
            Position=self.ifc_file.create_entity(
                "IfcAxis2Placement3D",
                Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(direction_x * offset_from_start,
                                                                                       direction_y * offset_from_start, opening_sill_height)),
                Axis=None,
                RefDirection=self.ifc_file.createIfcDirection((direction_x, direction_y))
            ),
            ExtrudedDirection=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            Depth=opening_height
        )
        return opening_extrusion

    def create_rel_voids_element(self, relating_building_element, related_opening_element):
        rel_voids_element = self.ifc_file.create_entity(
            "IfcRelVoidsElement",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=None,
            Description=None,
            RelatingBuildingElement=relating_building_element,
            RelatedOpeningElement=related_opening_element
        )
        return rel_voids_element
# IfcSpace creation
# Expected input:
# Example dictionary of space dimensions
    # space_dimensions_dict = {
    #     "A": [(0, 0), (4, 0), (4, 3), (0, 3)],
    #     "B": [(5, 5), (7, 5), (7, 7), (5, 7)]}

# ______________________________________________________________________________________
    def space_placement(self, slab_z_position):
        # Inception of coordination system - related to slab
        axis_placement_space = self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, float(slab_z_position))),
            Axis=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=self.ifc_file.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
        )

        space_placement = self.ifc_file.create_entity(
            "IfcLocalPlacement",
            RelativePlacement=axis_placement_space
        )
        return space_placement

    def create_space(self, dimensions, ifc_space_placement, floor_number, i, building_storey, extrusion_depth):
        # Reference to necessary variables
        context = self.geom_rep_sub_context

        # Define the boundary of the space using IfcPolyline
        points_polyline = []  # Initialize an empty list to store points
        space_vertices = list(dimensions["vertices"])

        for vertex in space_vertices:  # Iterate over the vertices
            # Create an IfcCartesianPoint for each vertex
            point = self.ifc_file.create_entity("IfcCartesianPoint",
                                                Coordinates=(float(vertex[0]), float(vertex[1])))
            points_polyline.append(point)  # Add the point to the list of points

        # Ensure the polyline is closed by appending the first point at the end if necessary
        if points_polyline[0].Coordinates != points_polyline[-1].Coordinates:
            points_polyline.append(points_polyline[0])

        # Create the polyline with the list of points
        polyline = self.ifc_file.create_entity("IfcPolyline", Points=points_polyline)

        # Create a profile definition using the polyline
        profile = self.ifc_file.create_entity(
            "IfcArbitraryClosedProfileDef",
            ProfileType="AREA",
            OuterCurve=polyline
        )

        # Define the extrusion direction (along the Z-axis)
        extrusion_direction = self.ifc_file.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0))

        # Define the extrusion depth (height of the space)

        # Define the position of the extruded solid
        position = self.ifc_file.create_entity(
            "IfcAxis2Placement3D",
            Location=self.ifc_file.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=None,
            RefDirection=None
        )

        # Create the extruded area solid
        solid = self.ifc_file.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=position,
            ExtrudedDirection=extrusion_direction,
            Depth=extrusion_depth
        )

        # Create the shape representation
        body_representation = self.ifc_file.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=context,
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[solid]
        )

        # Create the product definition shape
        product_definition_shape = self.ifc_file.create_entity(
            "IfcProductDefinitionShape",
            Representations=[body_representation]
        )

        # Create the IfcSpace entity
        ifc_space = self.ifc_file.create_entity(
            "IfcSpace",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=f"{str(floor_number) + '.' + str(i)}",
            Description=None,
            ObjectType=None,
            ObjectPlacement=ifc_space_placement,
            Representation=product_definition_shape,
            LongName=f"Room No. {str(floor_number) + '.' + str(i)} name",
            CompositionType="ELEMENT",
            PredefinedType="INTERNAL"
        )

        # Relate the IfcSpace to the building storey using IfcRelContainedInSpatialStructure
        self.ifc_file.create_entity(
            "IfcRelContainedInSpatialStructure",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=self.owner_history,
            Name=None,
            Description=None,
            RelatedElements=[ifc_space],
            RelatingStructure=building_storey
        )

        return ifc_space

    def write(self):
        self.ifc_file.write(self.output_file)
