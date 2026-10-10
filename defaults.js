// Shared by content script, background worker and popup.
// Bump AL_VERSION to make every install adopt new defaults once (see background.js).
const AL_VERSION = 2;
// Defaults = the "cinema" look.
const AL_DEFAULTS = {
  enabled: true,
  // glow
  blur: 90, spread: 70, opacity: 0.65, smoothing: 0.6, fadeIn: 800, fadeOut: 500,
  // color
  brightness: 0.95, contrast: 1.1, saturation: 1.2, vibrance: 0.2,
  // frame
  radius: 12,
  shadowOn: true, shadowSize: 60, shadowOpacity: 0.6,
  outlineOn: false, outlineWidth: 2, outlineColor: '#ffffff', outlineOpacity: 0.25,
  // performance
  fps: '60', resolution: 'high', eco: false,
  // edge feathering
  featherOn: false, featherSoftness: 40,
  // hide page elements
  hideSidebar: false, hideHeader: false, hideActions: false, hideNav: false, hideReveal: true
};
