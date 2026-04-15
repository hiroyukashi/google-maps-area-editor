import { toRadians, toDegrees, Vector2 } from './math.js';

export const STATE = Object.freeze({
    INITIAL: "initial",
    DRAWABLE: "drawable",
    DRAWING: "drawing",
    EDITING: "editing",
});

export class AreaType {
    #name;
    #color;

    /**
     * @param {string} name - Type identifier (used for serialization/deserialization)
     * @param {string} color - Display color (CSS color string)
     */
    constructor(name, color) {
        this.#name = name;
        this.#color = color;
    }

    /** @type {string} */
    get name() { return this.#name; }
    /** @type {string} */
    get color() { return this.#color; }
}

const SVG_PATH = {
    CIRCLE: "M0,-5 a5,5 0 1,0 0,10 a5,5 0 1,0 0,-10",
    DOUBLE_CIRCLE: "M0,-5 a5,5 0 1,0 0,10 a5,5 0 1,0 0,-10 M0,-2.5 a2.5,2.5 0 1,0 0,5 a2.5,2.5 0 1,0 0,-5",
};

function createMarkerSvg(path, scale) {
    // Match original google.maps.Marker Symbol rendering:
    // path coordinates scaled by `scale`, stroke always 1px
    const size = Math.ceil((5 * scale + 1) * 2);
    const half = size / 2;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `${-half} ${-half} ${size} ${size}`);
    svg.style.display = "block";
    svg.style.transform = "translateY(50%)";
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", path);
    pathEl.setAttribute("fill", "#ffffff");
    pathEl.setAttribute("stroke", "#000000");
    pathEl.setAttribute("stroke-width", "1");
    pathEl.setAttribute("vector-effect", "non-scaling-stroke");
    if (scale !== 1) pathEl.setAttribute("transform", `scale(${scale})`);
    svg.appendChild(pathEl);
    return svg;
}

function createDraggableContent(size) {
    const div = document.createElement("div");
    div.style.width = `${size}px`;
    div.style.height = `${size}px`;
    div.style.transform = "translateY(50%)";
    return div;
}

export class AreaEditor {
    #map;
    #drawing;
    /** @type {Area[]} */
    #areas = [];
    /** @type {Area|null} */
    #editingArea = null;
    #currentState = STATE.INITIAL;
    #areaType;
    #eventLayer;
    /** @type {Map<string, AreaType>} */
    #typesMap;
    #mapClickListener;

    onStateChange = (state) => {};

    /**
     * Creates an AreaEditor. Automatically loads required Google Maps libraries (geometry, marker).
     * @param {google.maps.Map} map
     * @param {Object} [options]
     * @param {AreaType[]} options.types - Available area types
     * @returns {Promise<AreaEditor>}
     */
    static async create(map, options = {}) {
        await google.maps.importLibrary("geometry");
        await google.maps.importLibrary("marker");
        return new AreaEditor(map, options);
    }

    /**
     * @param {google.maps.Map} map
     * @param {Object} [options]
     * @param {AreaType[]} options.types - Available area types
     */
    constructor(map, options = {}) {
        this.#map = map;
        this.#typesMap = new Map((options.types || []).map(t => [t.name, t]));
        this.#drawing = new Drawing(this.#map);

        this.#eventLayer = document.createElement("div");
        this.#eventLayer.style.position = "absolute";
        this.#eventLayer.style.top = "0";
        this.#eventLayer.style.left = "0";
        this.#eventLayer.style.width = "100%";
        this.#eventLayer.style.height = "100%";
        this.#eventLayer.style.zIndex = "10";
        this.#eventLayer.style.cursor = "crosshair";
        this.#eventLayer.style.display = "none";

        const mapDiv = this.#map.getDiv();
        mapDiv.appendChild(this.#eventLayer);

        this.#mapClickListener = this.#map.addListener("click", () => {
            this.endEditArea();
        });

        this.#initEvents();
    }

    #setState(state) {
        this.#currentState = state;

        if (state === STATE.DRAWABLE || state === STATE.DRAWING) {
            this.#eventLayer.style.display = "block";
        } else {
            this.#eventLayer.style.display = "none";
        }

        if (typeof this.onStateChange === "function") {
            this.onStateChange(state);
        }
    }

    #isState(state) {
        return this.#currentState === state;
    }

    #initEvents() {
        this.#eventLayer.addEventListener("mousedown", event => {
            if (event.button === 0) {
                event.preventDefault();
                if (this.#isState(STATE.DRAWABLE)) {
                    this.#drawing.begin(event.offsetX, event.offsetY);
                    this.#setState(STATE.DRAWING);
                }
            }
        });

        this.#eventLayer.addEventListener("mousemove", event => {
            event.preventDefault();
            if (this.#isState(STATE.DRAWING)) {
                this.#drawing.move(event.offsetX, event.offsetY);
            }
        });

        this.#eventLayer.addEventListener("mouseup", event => {
            if (event.button === 0) {
                event.preventDefault();
                if (this.#isState(STATE.DRAWING)) {
                    this.#drawing.end(event.offsetX, event.offsetY);
                    this.#setState(STATE.DRAWABLE);
                    const area = this.#drawing.toArea(this.#areaType);
                    if (area) {
                        area.onclick = () => {
                            this.beginEditArea(area, false);
                        };
                        this.#areas.push(area);
                        this.beginEditArea(area, false);
                    }
                }
            }
        });

        this.#eventLayer.addEventListener("mouseout", event => {
            event.preventDefault();
            if (this.#isState(STATE.DRAWING)) {
                this.#drawing.end(event.offsetX, event.offsetY);
                this.#setState(STATE.DRAWABLE);
            }
        });
    }
    
    // --- Public API ---

    setAreaType(type) {
        this.endEditArea();
        this.#areaType = type;
        this.#setState(STATE.DRAWABLE);
    }

    cancelAdd() {
        if (this.#isState(STATE.DRAWING)) {
            this.#drawing.end();
        }
        this.#setState(STATE.INITIAL);
    }

    loadAreas(jsonString) {
        this.#clearAreas();
        if (!jsonString) return;
        const parsed = JSON.parse(jsonString);
        this.#areas = parsed.map(a => {
            const type = this.#typesMap.get(a.type);
            if (!type) {
                throw new Error(`Unknown area type: "${a.type}"`);
            }
            const area = Area.fromUIArea(this.#map, type, a);
            area.onclick = () => {
                this.beginEditArea(area, false);
            };
            return area;
        });
    }

    exportAreasJSON() {
        return JSON.stringify(this.#areas.map(a => a.toUIArea()));
    }

    beginEditArea(area, mapCenter) {
        if (this.#editingArea) {
            this.#editingArea.editable = false;
        }
        area.editable = true;
        this.#editingArea = area;
        this.#setState(STATE.EDITING);
        if (mapCenter) {
            this.#map.setCenter(this.#editingArea.center);
        }
    }

    endEditArea() {
        if (this.#editingArea) {
            this.#editingArea.editable = false;
            this.#editingArea = null;
            this.#setState(STATE.INITIAL);
        }
    }

    editNext() {
        if (this.#areas.length) {
            const i = this.#areas.indexOf(this.#editingArea);
            this.beginEditArea(this.#areas[(i + 1 + this.#areas.length) % this.#areas.length], true);
        }
    }

    editPrev() {
        if (this.#areas.length) {
            const i = this.#areas.indexOf(this.#editingArea);
            this.beginEditArea(this.#areas[(Math.max(i, 0) - 1 + this.#areas.length) % this.#areas.length], true);
        }
    }

    removeEditingArea() {
        if (this.#editingArea) {
            const i = this.#areas.indexOf(this.#editingArea);
            if (i >= 0) {
                this.#editingArea.destroy();
                this.#editingArea = null;
                this.#areas.splice(i, 1);
                this.#setState(STATE.INITIAL);
            }
        }
    }

    destroy() {
        this.cancelAdd();
        this.endEditArea();
        this.#clearAreas();
        this.#drawing.destroy();
        google.maps.event.removeListener(this.#mapClickListener);
        this.#eventLayer.remove();
    }

    // --- Private helpers ---

    #clearAreas() {
        this.#areas.forEach(a => a.destroy());
        this.#areas = [];
    }
}

// Internal helper classes and functions

function toLatLng(map, x, y) {
    const projection = map.getProjection();
    const bounds = map.getBounds();
    const ne = projection.fromLatLngToPoint(bounds.getNorthEast());
    const sw = projection.fromLatLngToPoint(bounds.getSouthWest());
    const scale = 1 << map.getZoom();
    return projection.fromPointToLatLng(new google.maps.Point(x / scale + sw.x, y / scale + ne.y));
}

function toVector(latLngFrom, latLngTo) {
    return Vector2.create(
        toRadians(google.maps.geometry.spherical.computeHeading(latLngFrom, latLngTo)),
        google.maps.geometry.spherical.computeDistanceBetween(latLngFrom, latLngTo)
    );
}

function computeOffset(from, distance, angle) {
    return google.maps.geometry.spherical.computeOffset(from, Math.abs(distance), toDegrees(angle + (distance < 0 ? Math.PI : 0)));
}

function latLngArrayToBounds(points) {
    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    return bounds;
}

class Drawing {
    #map;
    #rectangle;
    #drawing = false;
    #origin;
    #diagonal;

    constructor(map) {
        this.#map = map;
        this.#rectangle = new google.maps.Rectangle({
            strokeColor: "#000000",
            strokeOpacity: 1.0,
            strokeWeight: 1,
            fillColor: "#000000",
            fillOpacity: 0.1,
            clickable: false,
            map: this.#map,
            zIndex: 1000,
        });
    }

    begin(x, y) {
        if (!this.#drawing) {
            this.#origin = toLatLng(this.#map, x, y);
            this.#diagonal = this.#origin;
            this.#showBounds();
            this.#drawing = true;
        }
    }

    move(x, y) {
        if (this.#drawing) {
            this.#diagonal = toLatLng(this.#map, x, y);
            this.#showBounds();
        }
    }

    end(x, y) {
        if (this.#drawing) {
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this.#diagonal = toLatLng(this.#map, x, y);
            }
            this.#hideBounds();
            this.#drawing = false;
        }
    }

    toArea(type) {
        return this.#origin
            && this.#diagonal
            && !this.#origin.equals(this.#diagonal)
            && Area.create(
                this.#map,
                type,
                google.maps.geometry.spherical.interpolate(this.#origin, this.#diagonal, 0.5),
                toVector(this.#origin, this.#diagonal)
            );
    }

    #showBounds() {
        const bounds = latLngArrayToBounds([this.#origin, this.#diagonal]);
        this.#rectangle.setBounds(bounds);
    }

    #hideBounds() {
        this.#rectangle.setBounds(null);
    }

    destroy() {
        this.#rectangle.setMap(null);
    }
}

class Area {
    static create(map, type, center, vDiagonal) {
        return new Area(map, type, center, Math.abs(vDiagonal.y), Math.abs(vDiagonal.x), 0);
    }

    static fromUIArea(map, type, area) {
        return new Area(
            map,
            type,
            new google.maps.LatLng(area.latitude, area.longitude),
            area.width,
            area.height,
            area.angle
        );
    }

    #map;
    #type;
    #center;
    #width;
    #height;
    #angle;
    #distN;
    #distE;
    #polygon;
    #corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    #anchors;
    #rotator;
    #editable = false;
    #listeners = [];
    onclick = () => { };

    constructor(map, type, center, width, height, angle) {
        this.#map = map;
        this.#type = type;
        this.#center = center;
        this.#width = width;
        this.#height = height;
        this.#angle = angle;
        this.#distN = height / 2;
        this.#distE = width / 2;

        this.#polygon = new google.maps.Polygon({
            strokeColor: type.color,
            strokeOpacity: 1.0,
            strokeWeight: 1,
            fillColor: type.color,
            fillOpacity: 0.1,
            clickable: true,
            draggable: false,
            map: this.#map,
        });

        this.#listeners.push(this.#polygon.addListener("click", () => this.onclick()));
        
        this.#listeners.push(this.#polygon.addListener("drag", () => {
            const path = this.#polygon.getPath();
            this.#center = google.maps.geometry.spherical.interpolate(path.getAt(0), path.getAt(2), 0.5);
            this.#showAnchors();
            this.#showRotator();
        }));

        this.#anchors = [
            new AreaAnchor(this.#map, 1, 1), new AreaAnchor(this.#map, 0, 1), new AreaAnchor(this.#map, -1, 1),
            new AreaAnchor(this.#map, -1, 0), new AreaAnchor(this.#map, -1, -1), new AreaAnchor(this.#map, 0, -1),
            new AreaAnchor(this.#map, 1, -1), new AreaAnchor(this.#map, 1, 0)
        ];

        this.#rotator = new AreaRotator(this.#map);

        this.#showBounds();
        this.#showAnchors();
        
        this.#anchors.forEach(a => {
            a.onresize = (center, height, width) => {
                this.#center = center;
                if (Number.isFinite(height)) {
                    this.#height = height;
                    this.#distN = height / 2;
                }
                if (Number.isFinite(width)) {
                    this.#width = width;
                    this.#distE = width / 2;
                }
                this.#showBounds();
                this.#showAnchors();
                this.#showRotator();
            };
        });

        this.#showRotator();
        this.#rotator.onrotate = angle => {
            this.#angle = angle;
            this.#showBounds();
            this.#showAnchors();
            this.#showRotator();
        };

        this.#listeners.push(this.#map.addListener("zoom_changed", () => {
            this.#showRotator();
        }));
    }

    get center() { return this.#center; }
    get bounds() { return this.#polygon.getPath().getArray(); }
    get editable() { return this.#editable; }
    set editable(editable) {
        this.#editable = editable;
        this.#showBounds();
        this.#showAnchors();
        this.#showRotator();
    }

    destroy() {
        this.#listeners.forEach(l => google.maps.event.removeListener(l));
        this.#rotator.destroy();
        this.#anchors.forEach(a => a.destroy());
        this.#polygon.setMap(null);
    }

    toUIArea() {
        return {
            type: this.#type.name,
            latitude: this.#center.lat(),
            longitude: this.#center.lng(),
            width: this.#width,
            height: this.#height,
            angle: this.#angle,
        };
    }

    #showBounds() {
        this.#polygon.setPath(this.#corners.map(c => {
            const v = new Vector2(this.#distN * c[0], this.#distE * c[1]);
            return computeOffset(this.#center, v.magnitude, v.angle + this.#angle);
        }));
        this.#polygon.setOptions({
            draggable: this.#editable,
            zIndex: this.#editable ? 101 : 100,
        });
    }

    #showAnchors() {
        this.#anchors.forEach(a => a.show(this.#center, this.#distN, this.#distE, this.#angle, this.#editable));
    }

    #showRotator() {
        this.#rotator.show(this.#center, this.#distN, this.#angle, this.#editable);
    }
}

class AreaAnchor {
    #map;
    #timesN;
    #timesE;
    #marker;
    #draggable;
    #origin;
    #vectorN;
    #vectorE;
    #dragging;
    onresize = (center, height, width) => { };

    constructor(map, timesN, timesE) {
        this.#map = map;
        this.#timesN = timesN;
        this.#timesE = timesE;

        this.#marker = new google.maps.marker.AdvancedMarkerElement({
            map: this.#map,
            content: createMarkerSvg(SVG_PATH.CIRCLE, 1.0),
            gmpClickable: false,
            zIndex: 200,
        });

        const createDraggable = () => {
            const marker = new google.maps.marker.AdvancedMarkerElement({
                map: this.#map,
                content: createDraggableContent(12),
                gmpDraggable: true,
                zIndex: 201,
            });
            marker.style.opacity = "0";
            const listeners = [];
            listeners.push(marker.addListener("dragstart", () => {
                this.#dragging = this.#draggable;
                this.#draggable = createDraggable();
            }));
            listeners.push(marker.addListener("drag", event => doResize(event)));
            listeners.push(marker.addListener("dragend", event => {
                listeners.forEach(l => google.maps.event.removeListener(l));
                this.#dragging.map = null;
                this.#dragging = null;
                doResize(event);
            }));
            return marker;
        };

        this.#draggable = createDraggable();

        const doResize = event => {
            if (this.#dragging) {
                const v = toVector(this.#origin, event.latLng);
                const height = this.#timesN ? this.#vectorN.dot(v) : null;
                const width = this.#timesE ? this.#vectorE.dot(v) : null;
                const cv = this.#timesN && this.#timesE ? v :
                           this.#timesN ? this.#vectorN.times(height) :
                           this.#vectorE.times(width);
                this.onresize(computeOffset(this.#origin, cv.magnitude / 2, cv.angle), height, width);
            }
        };
    }

    show(center, distN, distE, angle, editable) {
        const vn = new Vector2(distN * this.#timesN, 0).rot(angle);
        const ve = new Vector2(0, distE * this.#timesE).rot(angle);
        const v = vn.add(ve);
        const position = computeOffset(center, v.magnitude, v.angle);
        this.#marker.position = position;
        this.#marker.map = editable ? this.#map : null;
        this.#draggable.position = position;
        this.#draggable.map = editable ? this.#map : null;
        if (!this.#dragging) {
            this.#origin = computeOffset(center, v.magnitude, v.angle + Math.PI);
            this.#vectorN = vn.times(Math.sign(distN)).normalized;
            this.#vectorE = ve.times(Math.sign(distE)).normalized;
        }
    }

    destroy() {
        // TODO: Ideally should also remove event listeners from draggable markers
        if (this.#marker) this.#marker.map = null;
        if (this.#draggable) this.#draggable.map = null;
        if (this.#dragging) this.#dragging.map = null;
    }
}

class AreaRotator {
    #map;
    #line;
    #marker;
    #draggable;
    #dragging;
    #center;
    #inverse;
    onrotate = angle => { };

    constructor(map) {
        this.#map = map;
        this.#line = new google.maps.Polyline({
            strokeColor: "#000000",
            strokeOpacity: 1.0,
            strokeWeight: 1.0,
            map: this.#map,
            clickable: false,
            draggable: false,
            zIndex: 190,
        });

        this.#marker = new google.maps.marker.AdvancedMarkerElement({
            map: this.#map,
            content: createMarkerSvg(SVG_PATH.DOUBLE_CIRCLE, 2.0),
            gmpClickable: false,
            zIndex: 200,
        });

        const createDraggable = () => {
            const marker = new google.maps.marker.AdvancedMarkerElement({
                map: this.#map,
                content: createDraggableContent(22),
                gmpDraggable: true,
                zIndex: 201,
            });
            marker.style.opacity = "0";
            const listeners = [];
            listeners.push(marker.addListener("dragstart", () => {
                this.#dragging = this.#draggable;
                this.#draggable = createDraggable();
            }));
            listeners.push(marker.addListener("drag", event => doRotate(event)));
            listeners.push(marker.addListener("dragend", event => {
                listeners.forEach(l => google.maps.event.removeListener(l));
                this.#dragging.map = null;
                this.#dragging = null;
                doRotate(event);
            }));
            return marker;
        };

        this.#draggable = createDraggable();

        const doRotate = event => {
            if (this.#dragging) {
                let v = toVector(this.#center, event.latLng);
                if (this.#inverse) {
                    v = v.inverse;
                }
                this.onrotate(v.angle);
            }
        };
    }

    show(center, distN, angle, editable) {
        const scale = 1 << this.#map.getZoom();
        const positionN = computeOffset(center, distN, angle);
        const position = computeOffset(positionN, 5000000 * Math.sign(distN) / scale, angle);
        this.#line.setPath([positionN, position]);
        this.#line.setVisible(editable);
        this.#marker.position = position;
        this.#marker.map = editable ? this.#map : null;
        this.#draggable.position = position;
        this.#draggable.map = editable ? this.#map : null;
        this.#center = center;
        this.#inverse = distN < 0;
    }

    destroy() {
        // TODO: Ideally should also remove event listeners from draggable markers
        this.#line?.setMap(null);
        if (this.#marker) this.#marker.map = null;
        if (this.#draggable) this.#draggable.map = null;
        if (this.#dragging) this.#dragging.map = null;
    }
}