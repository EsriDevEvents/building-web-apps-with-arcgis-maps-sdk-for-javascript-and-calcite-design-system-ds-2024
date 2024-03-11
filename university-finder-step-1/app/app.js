import WebMap from "https://js.arcgis.com/4.29/@arcgis/core/WebMap.js";
import MapView from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import TileLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/TileLayer.js";
import Home from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Home.js";
import Legend from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Legend.js";
import Search from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import Expand from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Expand.js";

import { appConfig } from "./config.js";
import { appState } from "./state.js";

async function init() {
  // query for elements
  const rootShellNode = document.getElementById("root-shell");
  const themeNode = document.getElementById("toggle-mode");
  const darkModeCSS = document.getElementById("jsapi-mode-dark");

  const map = new WebMap({
    portalItem: {
      id: appConfig.webmap,
    },
  });

  const view = new MapView({
    container: "viewDiv",
    map,
    highlightOptions: {
      fillOpacity: 0,
      haloColor: "#D0D0D0",
    },
  });

  /* Firefly tile layer for basemap use */
  const fireflyBasemap = new TileLayer({
    url: "https://fly.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Firefly/MapServer",
  });
  map.add(fireflyBasemap);

  // Turn off visibility for light mode
  fireflyBasemap.visible = false;

  view.ui.add(
    new Home({
      view,
    }),
    "top-left"
  );

  view.ui.move("zoom", "top-left");

  const search = new Search({
    view,
    resultGraphicEnabled: false,
    popupEnabled: false,
  });

  const searchExpand = new Expand({
    view,
    content: search,
  });

  view.ui.add(searchExpand, "top-left");

  const legend = new Legend({
    view,
  });

  const legendExpand = new Expand({
    view,
    content: legend,
  });

  view.ui.add(legendExpand, "top-left");

  await view.when();

  const collegeLayer = view.map.layers.find(
    (layer) => layer.url === appConfig.collegeLayerUrl
  );

  if (!collegeLayer) {
    return;
  }

  await collegeLayer.load();

  collegeLayer.outFields = [
    ...appConfig.collegeLayerOutFields,
    collegeLayer.objectIdField,
  ];
  // handle theme swap
  themeNode.addEventListener("click", () => handleThemeChange());

  function handleThemeChange() {
    appState.activeItem = true;
    appState.theme = appState.theme === "dark" ? "light" : "dark";
    darkModeCSS.disabled = !darkModeCSS.disabled;
    if (appState.theme === "dark") {
      // Clear the basemap, and use the firefly tile layer
      map.basemap = null;
      fireflyBasemap.visible = true;
      rootShellNode.classList.add("calcite-mode-dark");
      themeNode.icon = "moon";
    } else {
      fireflyBasemap.visible = false; // Change firefly visibility for light mode
      map.basemap = "gray-vector";
      rootShellNode.classList.remove("calcite-mode-dark");
      themeNode.icon = "brightness";
    }
    setTimeout(() => {
      appState.activeItem = false;
    }, 1000);
  }
}

init();
