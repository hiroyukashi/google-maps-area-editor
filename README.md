# google-maps-area-editor

A rectangular area editor component for Google Maps JavaScript API.  
Allows users to draw, resize, rotate, and manage rectangular areas on a Google Map.

## Features

- Draw rectangular areas by mouse drag
- Resize areas via corner and edge anchors
- Rotate areas via a rotation handle
- Multiple area type support with custom colors
- Serialize / deserialize areas as JSON

## Requirements

- Google Maps JavaScript API with an API key
- The map **must** have `isFractionalZoomEnabled: false` set. The internal pixel-to-coordinate conversion uses `1 << map.getZoom()`, which requires integer zoom levels. Fractional zoom also causes excessive event firing that leads to rendering issues.

## Usage

```html
<script type="module">
  import { AreaEditor, AreaType, STATE } from './AreaEditor.js';

  // Define your area types
  const AREA_TYPES = {
    usual:     new AreaType("usual", "#00bbdd"),
    dangerous: new AreaType("dangerous", "#ff0000"),
    custom:    new AreaType("custom", "#9900ff"),
  };

  const { Map } = await google.maps.importLibrary("maps");

  const map = new Map(document.getElementById("map"), {
    center: { lat: 35.681236, lng: 139.767125 },
    zoom: 18,
    isFractionalZoomEnabled: false,
  });

  // Create editor (automatically loads geometry & marker libraries)
  const editor = await AreaEditor.create(map, {
    types: Object.values(AREA_TYPES),
  });

  // Listen for state changes
  editor.onStateChange = state => {
    console.log("State:", state); // STATE.INITIAL | STATE.DRAWABLE | STATE.DRAWING | STATE.EDITING
  };

  // Start drawing
  editor.setAreaType(AREA_TYPES.usual);

  // Cancel drawing mode
  editor.cancelAdd();

  // Navigate / remove editing area
  editor.editNext();
  editor.editPrev();
  editor.removeEditingArea();

  // Load / export
  editor.loadAreas(jsonString);
  const json = editor.exportAreasJSON();

  // Clean up
  editor.destroy();
</script>
```

## API

### `AreaType`

```js
new AreaType(name, color)
```

- `name` (string) — Identifier used for serialization / deserialization.
- `color` (string) — CSS color string for the area's stroke and fill.

### `AreaEditor`

#### Static

| Method | Description |
|---|---|
| `AreaEditor.create(map, options?)` | Async factory. Loads required Google Maps libraries and returns an `AreaEditor` instance. |

#### Constructor Options

| Option | Type | Description |
|---|---|---|
| `types` | `AreaType[]` | Array of area types available for use. Required for `loadAreas()` to resolve type names. |

#### Instance Methods

| Method | Description |
|---|---|
| `setAreaType(type)` | Enter drawing mode for the given `AreaType`. |
| `cancelAdd()` | Cancel drawing mode. |
| `loadAreas(jsonString)` | Load areas from JSON. Destroys any existing areas first. |
| `exportAreasJSON()` | Returns areas as a JSON string. |
| `editNext()` | Edit the next area. |
| `editPrev()` | Edit the previous area. |
| `removeEditingArea()` | Remove the currently editing area. |
| `destroy()` | Remove all areas, event listeners, and the overlay from the map. |

#### Callback

| Property | Description |
|---|---|
| `onStateChange` | `(state: string) => void` — Called when editor state changes. |

### `STATE`

Exported constants for state comparison:

```js
STATE.INITIAL   // "initial"
STATE.DRAWABLE  // "drawable"
STATE.DRAWING   // "drawing"
STATE.EDITING   // "editing"
```

## JSON Format

Each area is serialized as:

```json
{
  "type": "usual",
  "latitude": 35.681236,
  "longitude": 139.767125,
  "width": 100,
  "height": 50,
  "angle": 0.5
}
```

- `type` — Matches the `name` of an `AreaType`.
- `latitude` / `longitude` — Center of the area.
- `width` / `height` — Size in meters.
- `angle` — Rotation angle in radians.

## Demo

Open `index.html` in a browser to try the editor. To use your own API key:

1. Copy `config.example.js` to `config.local.js`
2. Replace `YOUR_API_KEY` with your Google Maps API key
3. `config.local.js` is gitignored and will not be committed

## License

MIT
