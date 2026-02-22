/**
 * Shared map configuration for all Leaflet maps in the app.
 */

import type L from "leaflet";

/** CartoDB Voyager — free, no API key needed */
export const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const DEFAULT_CENTER: L.LatLngTuple = [23.8103, 90.4125];
export const DEFAULT_ZOOM = 16;

/** Shared map init options */
export const MAP_OPTIONS: L.MapOptions = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  zoomControl: false,
  scrollWheelZoom: true,
  doubleClickZoom: true,
  tapHold: true,
};

/** MU brand red */
export const MU_RED = "#CC1B1B";
export const MU_AMBER = "#D97706";
export const MU_GREY = "#6B7280";
