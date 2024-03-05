import Map from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import SceneView from "https://js.arcgis.com/4.29/@arcgis/core/views/SceneView.js";
import RenderNode from "https://js.arcgis.com/4.29/@arcgis/core/views/3d/webgl/RenderNode.js";
import {
  toRenderCoordinates,
  renderCoordinateTransformAt,
} from "https://js.arcgis.com/4.29/@arcgis/core/views/3d/webgl.js";
import Extent from "https://js.arcgis.com/4.29/@arcgis/core/geometry/Extent.js";
import { executeQueryJSON } from "https://js.arcgis.com/4.29/@arcgis/core/rest/query.js";
import Query from "https://js.arcgis.com/4.29/@arcgis/core/rest/support/Query.js";
import Home from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Home.js";
import {
  mat3,
  mat4,
  vec3,
} from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import {
  eachAlways,
  debounce,
} from "https://js.arcgis.com/4.29/@arcgis/core/core/promiseUtils.js";

// todo: theming
// todo: code blocks

/*********************
 * Settings
 *********************/

// The clipping extent for the scene (in WGS84)
const mapExtent = new Extent({
  xmax: -130,
  xmin: -100,
  ymax: 40,
  ymin: 20,
  spatialReference: {
    wkid: 4326,
  },
});

// Request weather station data in this SR
const inputSR = {
  wkid: 3857,
};

// Maximum number of windmills
let maxWindmills = 100;

// The raw model has a height of ~10.0 units.
let windmillHeight = 10;
let windmillBladeSize = 4;
let customWindmillSize = undefined;
let customWindmillBladeSize = undefined;
let windDirection = undefined;
let windSpeed = undefined;

const map = new Map({
  basemap: "hybrid",
  ground: "world-elevation",
});

const view = new SceneView({
  container: "viewDiv",
  map: map,
  viewingMode: "global",
  clippingArea: mapExtent,
  extent: mapExtent,
  camera: {
    position: {
      x: -12977859.07,
      y: 4016696.94,
      z: 348.61,
      spatialReference: { wkid: 102100 },
    },
    heading: 316,
    tilt: 85,
  },
});

window.view = view;

const homeBtn = new Home({
  view: view,
});

view.ui.add(homeBtn, "top-left");

/*******************************************************
 * Query the wind direction (live data)
 ******************************************************/
const getWindDirection = () => {
  const layerURL =
    "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/weather_stations_010417/FeatureServer/0/query";

  const queryObject = new Query();
  queryObject.returnGeometry = true;
  queryObject.outFields = ["WIND_DIRECT", "WIND_SPEED"];
  queryObject.where = "STATION_NAME = 'Palm Springs'";

  return executeQueryJSON(layerURL, queryObject).then((results) => {
    return {
      direction: results.features[0].getAttribute("WIND_DIRECT") ?? 0,
      speed: results.features[0].getAttribute("WIND_SPEED") ?? 0,
    };
  });
};

/*******************************************************
 * Query some weather stations within the visible extent
 ******************************************************/
const getWeatherStations = () => {
  const layerURL =
    "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/palm_springs_wind_turbines/FeatureServer/0";

  const queryObject = new Query();
  queryObject.returnGeometry = true;
  queryObject.outFields = [
    "tower_h",
    "blade_l",
    "POINT_Z",
    "unique_id",
    "site_name",
    "on_year",
    "manufac",
    "model",
  ];
  queryObject.where = "tower_h > 0";
  queryObject.geometry = new Extent({
    spatialReference: { latestWkid: 3857, wkid: 102100 },
    xmin: -12981949.871392062,
    ymin: 4016481.072851243,
    xmax: -12975312.934556061,
    ymax: 4019327.2268792265,
  });
  queryObject.outSpatialReference = inputSR;

  return executeQueryJSON(layerURL, queryObject).then((results) => {
    return results.features;
  });
};

/***********************************************
 * Install our render node once we have the data
 **********************************************/
let renderNode = null;
let renderNodePromise = null;

const weatherStationPromise = getWeatherStations();
const windDirectionPromise = getWindDirection();

function initTurbineRender() {
  if (renderNode) {
    renderNode.destroy();
    renderNode = undefined;
  }

  const promise = eachAlways([
    windDirectionPromise,
    weatherStationPromise,
    view.when(),
  ])
    .then((results) => {
      if (promise !== renderNodePromise) {
        return;
      }

      const wind = {
        direction: windDirection ?? results[0].value.direction,
        speed: windSpeed ?? results[0].value.speed,
      };

      const stations = results[1].value;
      renderWindTurbines(
        stations.map(({ attributes, geometry }) => ({
          attributes,
          geometry,
        }))
      );
      renderNode = new WindmillRenderNode({ view, wind, stations });
    })
    .catch((error) => {
      console.log(error);
    });
  renderNodePromise = promise;
}

const initTurbineRenderDebounced = debounce(() => initTurbineRender(), 100);

initTurbineRenderDebounced();

function renderWindTurbines(turbines) {
  const list = document.getElementById("turbine-list");
  list.innerHTML = "";
  turbines.forEach((turbine) => {
    const listItem = document.createElement("calcite-list-item");
    const { site_name, unique_id, manufac, model, on_year } =
      turbine.attributes;
    listItem.label = `${site_name}: ${unique_id}`;
    listItem.description = `${manufac} - ${model}`;
    listItem.addEventListener("calciteListItemSelect", () => {
      view.goTo({
        target: turbine.geometry,
        scale: 1500,
      });
    });

    list.appendChild(listItem);

    const chip = document.createElement("calcite-chip");
    chip.innerText = on_year;
    chip.className = "custom-chip";
    chip.icon = "calendar";
    chip.slot = "content-end";
    listItem.appendChild(chip);
  });
}

const windSpeedEl = document.getElementById("wind-speed");
windSpeedEl.addEventListener("calciteSliderChange", function (event) {
  windSpeed = event.target.value;
  updateWindResetButton();
  initTurbineRenderDebounced();
});

const windDirectionEl = document.getElementById("wind-direction");
windDirectionEl.addEventListener("calciteSelectChange", function (event) {
  windDirection = event.target.value;
  updateWindResetButton();
  initTurbineRenderDebounced();
});

const windmillSizeEl = document.getElementById("windmill-size");
windmillSizeEl.addEventListener("calciteInputNumberChange", function (event) {
  customWindmillSize = event.target.value || undefined;
  updateWindResetButton();
  initTurbineRenderDebounced();
});

const windmillBladeSizeEl = document.getElementById("windmill-blade-size");
windmillBladeSizeEl.addEventListener(
  "calciteInputNumberChange",
  function (event) {
    customWindmillBladeSize = event.target.value || undefined;
    updateWindResetButton();
    initTurbineRenderDebounced();
  }
);

const windResetEl = document.getElementById("wind-reset");
windResetEl.addEventListener("click", function () {
  windSpeedEl.value = 0;
  windDirectionEl.value = 0;
  windmillSizeEl.value = undefined;
  windmillBladeSizeEl.value = undefined;

  windSpeed =
    windDirection =
    customWindmillBladeSize =
    customWindmillSize =
      undefined;

  updateWindResetButton();
  initTurbineRenderDebounced();
});

const updateWindResetButton = () => {
  if (
    windSpeed !== undefined ||
    windDirection !== undefined ||
    customWindmillBladeSize !== undefined ||
    customWindmillSize !== undefined
  ) {
    windResetEl.disabled = false;
  } else {
    windResetEl.disabled = true;
  }
};

/********************************
 * Create an external render node
 *******************************/
const WindmillRenderNode = RenderNode.createSubclass({
  // Input data
  wind: null,
  stations: null,
  view: null,

  // Number of stations to render
  numStations: null,

  // Local origin
  localOrigin: null,
  localOriginRender: null,

  // Vertex and index buffers
  vboBasePositions: null,
  vboBaseNormals: null,
  iboBase: null,
  vboBladesPositions: null,
  vboBladesNormals: null,
  iboBlades: null,

  // Vertex and index data
  windmillBasePositions: null,
  windmillBaseNormals: null,
  windmillBaseIndices: null,

  // Shader
  program: null,

  // Shader attribute and uniform locations
  programAttribVertexPosition: null,
  programAttribVertexNormal: null,
  programUniformProjectionMatrix: null,
  programUniformModelViewMatrix: null,
  programUniformNormalMatrix: null,
  programUniformAmbientColor: null,
  programUniformLightingDirection: null,
  programUniformDirectionalColor: null,

  // Per-instance data
  windmillInstanceWindSpeed: null,
  windmillInstanceRPM: null,
  windmillInstanceWindDirection: null,
  windmillInstanceTowerScale: null,
  windmillInstanceBladeScale: null,
  windmillInstanceBladeOffset: null,
  windmillInstanceInputToRender: null,

  // Temporary matrices and vectors,
  // used to avoid allocating objects in each frame.
  tempMatrix4: new Array(16),
  tempMatrix3: new Array(9),
  tempVec3: new Array(3),

  /**
   * Set up render node
   */
  initialize() {
    this.consumes.required.push("opaque-color");
    this.produces = "opaque-color";
    this.initShaders();
    this.initData(this.wind, this.stations);
  },

  /**
   * Called each time the scene is rendered.
   * This is part of the RenderNode interface.
   */
  render(inputs) {
    this.resetWebGLState();
    this.bindRenderTarget();

    const gl = this.gl;
    const time = Date.now() / 1000.0;

    // Set some global WebGL state
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // Enable our shader
    gl.useProgram(this.program);
    this.setCommonUniforms();

    // Draw all the bases (one draw call)
    this.bindWindmillBase();
    mat4.identity(this.tempMatrix4);

    // Apply local origin by translation the view matrix by the local origin, this will
    // put the view origin (0, 0, 0) at the local origin
    mat4.translate(this.tempMatrix4, this.tempMatrix4, this.localOriginRender);
    mat4.multiply(this.tempMatrix4, this.camera.viewMatrix, this.tempMatrix4);
    gl.uniformMatrix4fv(
      this.programUniformModelViewMatrix,
      false,
      this.tempMatrix4
    );

    // Normals are in world coordinates, normal transformation is therefore identity
    mat3.identity(this.tempMatrix3);
    gl.uniformMatrix3fv(
      this.programUniformNormalMatrix,
      false,
      this.tempMatrix3
    );

    gl.drawElements(
      gl.TRIANGLES,
      this.windmillBaseIndices.length,
      gl.UNSIGNED_SHORT,
      0
    );

    // Draw all the blades (one draw call per set of blades)
    this.bindWindmillBlades();
    for (let i = 0; i < this.numStations; ++i) {
      // Current rotation of the blade (varies with time, random offset)
      const bladeRotation = (time / 60) * this.windmillInstanceRPM[i] + i;

      // Blade transformation:
      // 1. Scale (according to blade size)
      // 2. Rotate around Y axis (according to wind speed, varies with time)
      // 3. Rotate around Z axis (according to wind direction)
      // 4. Translate along Z axis (to where the blades are attached to the base)
      // 5. Transform to render coordinates
      // 6. Transform to view coordinates
      mat4.identity(this.tempMatrix4);
      mat4.translate(
        this.tempMatrix4,
        this.tempMatrix4,
        this.windmillInstanceBladeOffset[i]
      );
      mat4.rotateZ(
        this.tempMatrix4,
        this.tempMatrix4,
        this.windmillInstanceWindDirection[i]
      );
      mat4.rotateY(this.tempMatrix4, this.tempMatrix4, bladeRotation);
      mat4.scale(
        this.tempMatrix4,
        this.tempMatrix4,
        this.windmillInstanceBladeScale[i]
      );
      mat4.multiply(
        this.tempMatrix4,
        this.windmillInstanceInputToRender[i],
        this.tempMatrix4
      );
      mat3.normalFromMat4(this.tempMatrix3, this.tempMatrix4);
      mat4.multiply(this.tempMatrix4, this.camera.viewMatrix, this.tempMatrix4);
      gl.uniformMatrix4fv(
        this.programUniformModelViewMatrix,
        false,
        this.tempMatrix4
      );
      gl.uniformMatrix3fv(
        this.programUniformNormalMatrix,
        false,
        this.tempMatrix3
      );
      gl.drawElements(
        gl.TRIANGLES,
        windmill_blades_indices.length,
        gl.UNSIGNED_SHORT,
        0
      );
    }

    // Draw continuously
    this.requestRender();

    // return output fbo (= input fbo)
    return inputs.find(({ name }) => name === "opaque-color");
  },

  /**
   * Loads a shader from a <script> html tag
   */
  getShader(gl, id) {
    const shaderScript = document.getElementById(id);
    if (!shaderScript) {
      return null;
    }

    let str = "";
    let k = shaderScript.firstChild;
    while (k) {
      if (k.nodeType == 3) {
        str += k.textContent;
      }
      k = k.nextSibling;
    }

    let shader;
    if (shaderScript.type == "x-shader/x-fragment") {
      shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
      shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
      return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(shader));
      return null;
    }

    return shader;
  },

  /**
   * Links vertex and fragment shaders into a GLSL program
   */
  linkProgram(gl, fragmentShader, vertexShader) {
    const shaderProgram = gl.createProgram();

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      return null;
    }

    return shaderProgram;
  },

  /**
   * Initializes all shaders requried by the application
   */
  initShaders() {
    const gl = this.gl;

    const fragmentShader = this.getShader(gl, "shader-fs");
    const vertexShader = this.getShader(gl, "shader-vs");
    this.program = this.linkProgram(gl, fragmentShader, vertexShader);
    if (!this.program) {
      alert("Could not initialize shaders");
    }

    gl.useProgram(this.program);

    // Program attributes
    this.programAttribVertexPosition = gl.getAttribLocation(
      this.program,
      "aVertexPosition"
    );
    this.programAttribVertexNormal = gl.getAttribLocation(
      this.program,
      "aVertexNormal"
    );

    // Program uniforms
    this.programUniformProjectionMatrix = gl.getUniformLocation(
      this.program,
      "uProjectionMatrix"
    );
    this.programUniformModelViewMatrix = gl.getUniformLocation(
      this.program,
      "uModelViewMatrix"
    );
    this.programUniformNormalMatrix = gl.getUniformLocation(
      this.program,
      "uNormalMatrix"
    );
    this.programUniformAmbientColor = gl.getUniformLocation(
      this.program,
      "uAmbientColor"
    );
    this.programUniformLightingDirection = gl.getUniformLocation(
      this.program,
      "uLightingDirection"
    );
    this.programUniformDirectionalColor = gl.getUniformLocation(
      this.program,
      "uDirectionalColor"
    );
  },

  /**
   * Creates a vertex buffer from the given data.
   */
  createVertexBuffer(gl, data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    // We have filled vertex buffers in 64bit precision,
    // convert to a format compatible with WebGL
    const float32Data = new Float32Array(data);

    gl.bufferData(gl.ARRAY_BUFFER, float32Data, gl.STATIC_DRAW);
    return buffer;
  },

  /**
   * Creates an index buffer from the given data.
   */
  createIndexBuffer(gl, data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  },

  /**
   * Rotations per second of our turbine for a given wind speed (in km/h).
   *
   * This is not an exact physical formula, but rather a rough guess used
   * to show qualitative differences between wind speeds.
   */
  getRPM(windSpeed, bladeLength) {
    const tipSpeedRatio = 6.0;
    return (
      (60 * ((windSpeed * 1000) / 3600) * tipSpeedRatio) /
      (Math.PI * 2 * bladeLength)
    );
  },

  /**
   * Initializes all windmill data
   *
   * General overview:
   * - We create a single vertex buffer with all the vertices of all windmill bases.
   *   This way we can render all the bases in a single draw call.
   * - Storing the vertices directly in render coordinates would introduce precision issues.
   *   We store them in the coordinate system of a local origin of our choice instead.
   * - We create a vertex buffer with the vertices of one set of windmill blades.
   *   Since the blades are animated, we render each set of blades with a different,
   *   time-dependent transformation.
   */
  initData(wind, stations) {
    const gl = this.gl;
    this.numStations = Math.min(stations.length, maxWindmills);

    // Choose a local origin.
    // In our case, we simply use the map center.
    // For global scenes, you'll need multiple local origins.
    const localOriginSR = mapExtent.center.spatialReference;
    this.localOrigin = [mapExtent.center.x, mapExtent.center.y, 0];

    // Calculate local origin in render coordinates with 32bit precision
    this.localOriginRender = toRenderCoordinates(
      view,
      this.localOrigin,
      0,
      localOriginSR,
      new Float32Array(3),
      0,
      1
    );

    // Extract station data into flat arrays.
    this.windmillInstanceWindSpeed = new Float32Array(this.numStations);
    this.windmillInstanceRPM = new Float32Array(this.numStations);
    this.windmillInstanceWindDirection = new Float32Array(this.numStations);
    this.windmillInstanceTowerScale = new Float32Array(this.numStations);
    this.windmillInstanceBladeScale = new Array(this.numStations);
    this.windmillInstanceBladeOffset = new Array(this.numStations);
    this.windmillInstanceInputToRender = new Array(this.numStations);

    for (let i = 0; i < this.numStations; ++i) {
      const station = stations[i];
      const bladeLength = station.getAttribute("blade_l");
      const towerHeight = station.getAttribute("tower_h");

      // Speed and direction.
      this.windmillInstanceWindSpeed[i] = wind.speed;
      this.windmillInstanceRPM[i] = this.getRPM(wind.speed, bladeLength);
      this.windmillInstanceWindDirection[i] = (wind.direction / 180) * Math.PI;

      // Offset and scale
      const towerScale = customWindmillSize ?? towerHeight / windmillHeight;
      this.windmillInstanceTowerScale[i] = towerScale;
      const bladeScale =
        customWindmillBladeSize ?? bladeLength / windmillBladeSize;
      this.windmillInstanceBladeScale[i] = [bladeScale, bladeScale, bladeScale];
      this.windmillInstanceBladeOffset[i] = vec3.create();
      vec3.scale(
        this.windmillInstanceBladeOffset[i],
        windmill_blades_offset,
        towerScale
      );

      // Transformation from input to render coordinates.
      const inputSR = station.geometry.spatialReference;
      const point = [
        station.geometry.x,
        station.geometry.y,
        station.getAttribute("POINT_Z") || station.geometry.z,
      ];
      const inputToRender = renderCoordinateTransformAt(
        view,
        point,
        inputSR,
        new Float64Array(16)
      );
      this.windmillInstanceInputToRender[i] = inputToRender;
    }

    // Transform all vertices of the windmill base into the coordinate system of
    // the local origin, and merge them into a single vertex buffer.
    this.windmillBasePositions = new Float64Array(
      this.numStations * windmill_base_positions.length
    );
    this.windmillBaseNormals = new Float64Array(
      this.numStations * windmill_base_normals.length
    );
    this.windmillBaseIndices = new Uint16Array(
      this.numStations * windmill_base_indices.length
    );

    for (let i = 0; i < this.numStations; ++i) {
      // Transformation of positions from local to render coordinates
      const positionMatrix = new Float64Array(16);
      mat4.identity(positionMatrix);
      mat4.rotateZ(
        positionMatrix,
        positionMatrix,
        this.windmillInstanceWindDirection[i]
      );
      mat4.multiply(
        positionMatrix,
        this.windmillInstanceInputToRender[i],
        positionMatrix
      );

      // Transformation of normals from local to render coordinates
      const normalMatrix = new Float64Array(9);
      mat3.normalFromMat4(normalMatrix, positionMatrix);

      // Append vertex and index data
      const numCoordinates = windmill_base_positions.length;
      const numVertices = numCoordinates / 3;
      for (let j = 0; j < numCoordinates; ++j) {
        this.windmillBasePositions[i * numCoordinates + j] =
          windmill_base_positions[j] * this.windmillInstanceTowerScale[i];
        this.windmillBaseNormals[i * numCoordinates + j] =
          windmill_base_normals[j];
      }

      // Transform vertices into render coordinates
      vec3.forEach(
        this.windmillBasePositions,
        0,
        i * numCoordinates,
        numVertices,
        vec3.transformMat4,
        positionMatrix
      );

      // Subtract local origin coordinates
      vec3.forEach(
        this.windmillBasePositions,
        0,
        i * numCoordinates,
        numVertices,
        vec3.subtract,
        this.localOriginRender
      );

      // Transform normals into render coordinates
      vec3.forEach(
        this.windmillBaseNormals,
        0,
        i * numCoordinates,
        numVertices,
        vec3.transformMat3,
        normalMatrix
      );

      // Re-normalize normals
      vec3.forEach(
        this.windmillBaseNormals,
        0,
        i * numCoordinates,
        numVertices,
        vec3.normalize
      );

      // Append index data
      const numIndices = windmill_base_indices.length;
      for (let j = 0; j < numIndices; ++j) {
        this.windmillBaseIndices[i * numIndices + j] =
          windmill_base_indices[j] + i * numVertices;
      }
    }

    // Upload our data to WebGL
    this.vboBasePositions = this.createVertexBuffer(
      gl,
      this.windmillBasePositions
    );
    this.vboBaseNormals = this.createVertexBuffer(gl, this.windmillBaseNormals);
    this.vboBladesPositions = this.createVertexBuffer(
      gl,
      windmill_blades_positions
    );
    this.vboBladesNormals = this.createVertexBuffer(
      gl,
      windmill_blades_normals
    );
    this.iboBase = this.createIndexBuffer(gl, this.windmillBaseIndices);
    this.iboBlades = this.createIndexBuffer(gl, windmill_blades_indices);
  },

  /**
   * Activates vertex attributes for the drawing of the windmill base.
   */
  bindWindmillBase() {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBasePositions);
    gl.enableVertexAttribArray(this.programAttribVertexPosition);
    gl.vertexAttribPointer(
      this.programAttribVertexPosition,
      3,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBaseNormals);
    gl.enableVertexAttribArray(this.programAttribVertexNormal);
    gl.vertexAttribPointer(
      this.programAttribVertexNormal,
      3,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iboBase);
  },

  /**
   * Activates vertex attributes for the drawing of the windmill blades.
   */
  bindWindmillBlades() {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBladesPositions);
    gl.enableVertexAttribArray(this.programAttribVertexPosition);
    gl.vertexAttribPointer(
      this.programAttribVertexPosition,
      3,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBladesNormals);
    gl.enableVertexAttribArray(this.programAttribVertexNormal);
    gl.vertexAttribPointer(
      this.programAttribVertexNormal,
      3,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iboBlades);
  },

  /**
   * Returns a color vector from a {color, intensity} object.
   */
  getFlatColor(src, output) {
    output[0] = src.color[0] * src.intensity;
    output[1] = src.color[1] * src.intensity;
    output[2] = src.color[2] * src.intensity;
    return output;
  },

  /**
   * Sets common shader uniforms
   */
  setCommonUniforms() {
    const gl = this.gl;
    const camera = this.camera;

    gl.uniform3fv(
      this.programUniformDirectionalColor,
      this.getFlatColor(this.sunLight.diffuse, this.tempVec3)
    );
    gl.uniform3fv(
      this.programUniformAmbientColor,
      this.getFlatColor(this.sunLight.ambient, this.tempVec3)
    );
    gl.uniform3fv(
      this.programUniformLightingDirection,
      this.sunLight.direction
    );

    gl.uniformMatrix4fv(
      this.programUniformProjectionMatrix,
      false,
      this.camera.projectionMatrix
    );
  },
});
