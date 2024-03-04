/** Calcite demo application boilerplate functionality - not related to demo content */

const toggleModeEl = document.getElementById("toggle-mode");
const toggleModalEl = document.getElementById("toggle-modal");

const navigationEl = document.getElementById("nav");
const panelEl = document.getElementById("sheet-panel");
const modalEl = document.getElementById("modal");
const sheetEl = document.getElementById("sheet");
const darkModeCss = document.getElementById("jsapi-mode-dark");
const lightModeCss = document.getElementById("jsapi-mode-light");

let mode = "light";

toggleModeEl.addEventListener("click", () => handleModeChange());
toggleModalEl.addEventListener("click", () => handleModalChange());
navigationEl.addEventListener("calciteNavigationActionSelect", () =>
  handleSheetOpen()
);

panelEl.addEventListener("calcitePanelClose", () => handlePanelClose());

function handleModeChange() {
  mode = mode === "dark" ? "light" : "dark";
  const isDarkMode = mode === "dark";
  darkModeCss.disabled = !darkModeCss.disabled;
  lightModeCss.disabled = !lightModeCss.disabled;
  toggleModeEl.icon = isDarkMode ? "moon" : "brightness";
  document.body.className = isDarkMode ? "calcite-mode-dark" : undefined;
  const viewUIEl = document.querySelector("#viewDiv .esri-ui");
  viewUIEl.classList.toggle("calcite-mode-dark", isDarkMode);
  viewUIEl.classList.toggle("calcite-mode-light", !isDarkMode);
}

function handleModalChange() {
  modalEl.open = !modalEl.open;
}

function handleSheetOpen() {
  sheetEl.open = true;
  panelEl.closed = false;
}

function handlePanelClose() {
  sheetEl.open = false;
}
