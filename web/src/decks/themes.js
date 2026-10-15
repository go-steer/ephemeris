// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Themes and theme picker adapted from substrate-scope so ephemeris /decks
// shares the exact dark & light color palettes, WCAG contrast helpers, and
// CSS custom property tokens.

export const TOKENS = [
  'id',
  'name',
  'mode',
  'scene.background',
  'scene.backgroundTop',
  'scene.fog',
  'scene.fogDensity',
  'scene.grid',
  'scene.gridAlpha',
  'scene.sea',
  'scene.seaAlpha',
  'scene.stars',
  'scene.starAlpha',
  'island.fill',
  'island.side',
  'island.edge',
  'island.edgeAlpha',
  'island.label',
  'district.fill',
  'district.fillJitter',
  'district.edge',
  'district.edgeAlpha',
  'district.dots',
  'district.label',
  'worker.pad',
  'worker.padEdge',
  'worker.idle',
  'worker.active',
  'worker.draining',
  'worker.highlight',
  'worker.fill',
  'worker.full',
  'worker.track',
  'worker.parked',
  'router.shaft',
  'router.emissive',
  'router.band',
  'router.beacon',
  'links.color',
  'links.alpha',
  'links.highlight',
  'links.flow',
  'links.focusAlpha',
  'team.saturation',
  'team.lightness',
  'team.alpha',
  'states.running',
  'states.changing',
  'states.suspended',
  'states.crashed',
  'states.pending',
  'effects.wake',
  'effects.suspend',
  'effects.crash',
  'effects.beam',
  'effects.removed',
  'marker.select',
  'marker.hover',
  'glow.additive',
  'glow.emissive',
  'glow.ambient',
  'glow.diffuse',
  'glow.hemi',
  'glow.gloss',
  'glow.ink',
  'glow.occlusion',
  'bloom.strength',
  'bloom.radius',
  'bloom.threshold',
  'light.toneMapping',
  'light.exposure',
  'light.ambient',
  'light.ambientIntensity',
  'light.hemiSky',
  'light.hemiGround',
  'light.hemiIntensity',
  'light.sun',
  'light.sunIntensity',
  'light.shadow',
  'light.shadowAlpha',
  'ui.glass',
  'ui.glassStrong',
  'ui.line',
  'ui.text',
  'ui.text2',
  'ui.muted',
  'ui.accent',
  'ui.accentText',
  'ui.chipBg',
  'ui.chipHover',
  'ui.inputBg',
  'ui.btnBg',
  'ui.btnBorder',
  'ui.btnText',
  'ui.btnHover',
  'ui.primaryBg',
  'ui.primaryBorder',
  'ui.primaryText',
  'ui.warnBg',
  'ui.warnBorder',
  'ui.labelBg',
  'ui.labelBorder',
  'ui.labelShadow',
  'ui.selBorder',
  'ui.codeBg',
  'ui.shadow',
  'ui.logo',
  'ui.wordmark',
  'ui.evAdded',
  'ui.evWoke',
  'ui.evSuspended',
  'ui.evCrashed',
  'ui.evTask',
  'ui.evRemoved',
  'ui.evWorker',
  'ui.evMeta',
];

export const OPTIONAL = new Set(['scene.stars']);

export const THEMES = [
  {
    id: 'abyss-neon',
    name: 'Abyss Neon',
    mode: 'dark',
    scene: {
      background: '#07111f',
      backgroundTop: '#0c2340',
      fog: '#07111f',
      fogDensity: 0.0045,
      grid: '#2ee6d6',
      gridAlpha: 0.2,
      sea: '#0a1a2e',
      seaAlpha: 0.85,
      stars: '#7fb4e8',
      starAlpha: 0.6,
    },
    island: {
      fill: '#10223d',
      side: '#0a172b',
      edge: '#2ee6d6',
      edgeAlpha: 0.85,
      label: '#4f78ad',
    },
    district: {
      fill: '#0d1d35',
      fillJitter: 0.08,
      edge: '#3d9be0',
      edgeAlpha: 0.5,
      dots: '#21507d',
      label: '#e4f4ff',
    },
    worker: {
      pad: '#132a4a',
      padEdge: '#3fb2e8',
      idle: '#1b3558',
      active: '#0fa395',
      draining: '#8f7bff',
      highlight: '#9ff7ef',
      fill: '#3fb2e8',
      full: '#ffb347',
      track: '#1b3558',
      parked: '#0a172b',
    },
    router: { shaft: '#14284a', emissive: '#08223a', band: '#2ee6d6', beacon: '#a6fff6' },
    links: {
      color: '#2bb8ad',
      alpha: 0.14,
      highlight: '#9ff7ef',
      flow: '#a6fff6',
      focusAlpha: 0.9,
    },
    team: { saturation: 0.55, lightness: 0.6, alpha: 0.24 },
    states: {
      running: '#0fa395',
      changing: '#8f7bff',
      suspended: '#2c3e63',
      crashed: '#ec3d5a',
      pending: '#f59e0b',
    },
    effects: {
      wake: '#5ff2e6',
      suspend: '#5f7fbf',
      crash: '#ec3d5a',
      beam: '#8ff7ee',
      removed: '#5d6c8c',
    },
    marker: { select: '#ffffff', hover: '#9ff7ef' },
    glow: {
      additive: true,
      emissive: 1.25,
      ambient: 0.1,
      diffuse: 0.45,
      hemi: 0.22,
      gloss: 0,
      ink: 0,
      occlusion: 0.15,
    },
    bloom: { strength: 0.8, radius: 0.5, threshold: 0.5 },
    light: {
      toneMapping: 'neutral',
      exposure: 1.05,
      ambient: '#0d2240',
      ambientIntensity: 0.45,
      hemiSky: '#8fc8ff',
      hemiGround: '#07111f',
      hemiIntensity: 0.95,
      sun: '#dff4ff',
      sunIntensity: 1.4,
      shadow: false,
      shadowAlpha: 0,
    },
    ui: {
      glass: 'rgba(10, 24, 44, 0.76)',
      glassStrong: 'rgba(8, 18, 34, 0.94)',
      line: 'rgba(110, 180, 235, 0.2)',
      text: '#e4f2ff',
      text2: '#b9cee8',
      muted: '#8ca3c4',
      accent: '#2ee6d6',
      accentText: '#022421',
      chipBg: 'rgba(255, 255, 255, 0.04)',
      chipHover: 'rgba(46, 230, 214, 0.12)',
      inputBg: 'rgba(0, 0, 0, 0.32)',
      btnBg: 'rgba(46, 230, 214, 0.1)',
      btnBorder: 'rgba(46, 230, 214, 0.45)',
      btnText: '#d4fffb',
      btnHover: 'rgba(46, 230, 214, 0.2)',
      primaryBg: '#2ee6d6',
      primaryBorder: '#7ff2e8',
      primaryText: '#022421',
      warnBg: 'rgba(143, 123, 255, 0.12)',
      warnBorder: 'rgba(143, 123, 255, 0.5)',
      labelBg: 'rgba(5, 12, 24, 0.76)',
      labelBorder: 'rgba(110, 180, 235, 0.22)',
      labelShadow: '0 1px 3px #000',
      selBorder: '#2ee6d6',
      codeBg: 'rgba(255, 255, 255, 0.06)',
      shadow: '0 10px 40px rgba(0, 0, 0, 0.45)',
      wordmark: 'linear-gradient(#e4f2ff, #e4f2ff)',
      logo: 'linear-gradient(135deg, #2ee6d6, #3d9be0 60%, #8f7bff)',
      evAdded: '#7fe8ff',
      evWoke: '#0fa395',
      evSuspended: '#6f86b8',
      evCrashed: '#ec3d5a',
      evTask: '#8f7bff',
      evRemoved: '#5d6c8c',
      evWorker: '#2ee6d6',
      evMeta: '#5f7399',
    },
  },
  {
    id: 'google-light',
    name: 'Google Light',
    mode: 'light',
    scene: {
      background: '#f8f9fa',
      backgroundTop: '#ffffff',
      fog: '#f8f9fa',
      fogDensity: 0.003,
      grid: '#bdc1c6',
      gridAlpha: 0.55,
      sea: '#f1f3f4',
      seaAlpha: 0.8,
      stars: null,
      starAlpha: 0,
    },
    island: {
      fill: '#ffffff',
      side: '#dadce0',
      edge: '#a770ef',
      edgeAlpha: 0.65,
      label: '#9aa0a6',
    },
    district: {
      fill: '#f1f3f4',
      fillJitter: 0,
      edge: '#dadce0',
      edgeAlpha: 1,
      dots: '#dadce0',
      label: '#202124',
    },
    worker: {
      pad: '#ffffff',
      padEdge: '#bdc1c6',
      idle: '#f1f3f4',
      active: '#188038',
      draining: '#9334e6',
      highlight: '#1a73e8',
      fill: '#1a73e8',
      full: '#e37400',
      track: '#e8eaed',
      parked: '#f8f9fa',
    },
    router: { shaft: '#e8eaed', emissive: '#000000', band: '#217bfe', beacon: '#a770ef' },
    links: {
      color: '#1a73e8',
      alpha: 0.22,
      highlight: '#1a73e8',
      flow: '#4285f4',
      focusAlpha: 0.9,
    },
    team: { saturation: 0.6, lightness: 0.72, alpha: 0.6 },
    states: {
      running: '#188038',
      changing: '#9334e6',
      suspended: '#bdc1c6',
      crashed: '#d93025',
      pending: '#e37400',
    },
    effects: {
      wake: '#188038',
      suspend: '#9aa0a6',
      crash: '#d93025',
      beam: '#1a73e8',
      removed: '#bdc1c6',
    },
    marker: { select: '#217bfe', hover: '#a770ef' },
    glow: {
      additive: false,
      emissive: 0.08,
      ambient: 0.7,
      diffuse: 0.32,
      hemi: 0.06,
      gloss: 0.06,
      ink: 0.18,
      occlusion: 0.18,
    },
    bloom: { strength: 0, radius: 0.4, threshold: 0.95 },
    light: {
      toneMapping: 'none',
      exposure: 1.0,
      ambient: '#ffffff',
      ambientIntensity: 0.65,
      hemiSky: '#ffffff',
      hemiGround: '#e8eaed',
      hemiIntensity: 1.25,
      sun: '#ffffff',
      sunIntensity: 1.4,
      shadow: true,
      shadowAlpha: 0.35,
    },
    ui: {
      glass: 'rgba(255, 255, 255, 0.94)',
      glassStrong: 'rgba(255, 255, 255, 0.98)',
      line: '#dadce0',
      text: '#202124',
      text2: '#3c4043',
      muted: '#5f6368',
      accent: '#1a73e8',
      accentText: '#ffffff',
      chipBg: 'rgba(32, 33, 36, 0.04)',
      chipHover: '#e8f0fe',
      inputBg: '#ffffff',
      btnBg: '#ffffff',
      btnBorder: '#dadce0',
      btnText: '#1967d2',
      btnHover: '#e8f0fe',
      primaryBg: '#1a73e8',
      primaryBorder: '#1a73e8',
      primaryText: '#ffffff',
      warnBg: 'rgba(147, 52, 230, 0.06)',
      warnBorder: '#d7aefb',
      labelBg: 'rgba(255, 255, 255, 0.96)',
      labelBorder: '#dadce0',
      labelShadow: 'none',
      selBorder: '#a770ef',
      codeBg: '#f1f3f4',
      shadow: '0 1px 2px rgba(60, 64, 67, 0.3), 0 2px 6px 2px rgba(60, 64, 67, 0.15)',
      logo: 'linear-gradient(135deg, #217bfe 0%, #078efb 33%, #a770ef 66%, #ff5e62 100%)',
      wordmark: 'linear-gradient(90deg, #217bfe 0%, #078efb 33%, #a770ef 66%, #ff5e62 100%)',
      evAdded: '#1a73e8',
      evWoke: '#188038',
      evSuspended: '#9aa0a6',
      evCrashed: '#d93025',
      evTask: '#9334e6',
      evRemoved: '#bdc1c6',
      evWorker: '#1e8e3e',
      evMeta: '#bdc1c6',
    },
  },
  {
    id: 'orchid-night',
    name: 'Orchid Night',
    mode: 'dark',
    scene: {
      background: '#140b22',
      backgroundTop: '#2b1250',
      fog: '#140b22',
      fogDensity: 0.0045,
      grid: '#ff7ac8',
      gridAlpha: 0.32,
      sea: '#1d0f35',
      seaAlpha: 0.85,
      stars: '#ffc2ec',
      starAlpha: 0.7,
    },
    island: {
      fill: '#22133d',
      side: '#170c2b',
      edge: '#ff7ac8',
      edgeAlpha: 0.95,
      label: '#8d6cc4',
    },
    district: {
      fill: '#1c1033',
      fillJitter: 0.06,
      edge: '#b48cff',
      edgeAlpha: 0.55,
      dots: '#4f3a7d',
      label: '#f5ebff',
    },
    worker: {
      pad: '#2a1849',
      padEdge: '#c49cff',
      idle: '#3a2a5c',
      active: '#9a6cf2',
      draining: '#b09000',
      highlight: '#ffb3e6',
      fill: '#c49cff',
      full: '#ffb347',
      track: '#3a2a5c',
      parked: '#170c2b',
    },
    router: { shaft: '#2a1748', emissive: '#1d0a36', band: '#ff7ac8', beacon: '#ffb3e6' },
    links: {
      color: '#c873b0',
      alpha: 0.14,
      highlight: '#ffb3e6',
      flow: '#ffc2ec',
      focusAlpha: 0.88,
    },
    team: { saturation: 0.55, lightness: 0.62, alpha: 0.24 },
    states: {
      running: '#9a6cf2',
      changing: '#b09000',
      suspended: '#4b3f6b',
      crashed: '#e8306b',
      pending: '#f59e0b',
    },
    effects: {
      wake: '#c9a6ff',
      suspend: '#8a78c0',
      crash: '#e8306b',
      beam: '#d7c2ff',
      removed: '#7f6fa6',
    },
    marker: { select: '#ffffff', hover: '#ffb3e6' },
    glow: {
      additive: true,
      emissive: 1.3,
      ambient: 0.1,
      diffuse: 0.45,
      hemi: 0.22,
      gloss: 0,
      ink: 0,
      occlusion: 0.15,
    },
    bloom: { strength: 0.95, radius: 0.55, threshold: 0.5 },
    light: {
      toneMapping: 'neutral',
      exposure: 1.05,
      ambient: '#2a1748',
      ambientIntensity: 0.45,
      hemiSky: '#cdb0ff',
      hemiGround: '#140b22',
      hemiIntensity: 0.95,
      sun: '#ffe4f6',
      sunIntensity: 1.3,
      shadow: false,
      shadowAlpha: 0,
    },
    ui: {
      glass: 'rgba(31, 16, 56, 0.76)',
      glassStrong: 'rgba(24, 12, 44, 0.94)',
      line: 'rgba(200, 160, 255, 0.2)',
      text: '#f5ebff',
      text2: '#d8c6f5',
      muted: '#ab98d0',
      accent: '#ff7ac8',
      accentText: '#2a0620',
      chipBg: 'rgba(255, 255, 255, 0.04)',
      chipHover: 'rgba(255, 122, 200, 0.14)',
      inputBg: 'rgba(10, 4, 20, 0.45)',
      btnBg: 'rgba(255, 122, 200, 0.12)',
      btnBorder: 'rgba(255, 122, 200, 0.5)',
      btnText: '#ffe3f3',
      btnHover: 'rgba(255, 122, 200, 0.24)',
      primaryBg: '#ff7ac8',
      primaryBorder: '#ff9ad6',
      primaryText: '#2a0620',
      warnBg: 'rgba(176, 144, 0, 0.14)',
      warnBorder: 'rgba(214, 180, 40, 0.55)',
      labelBg: 'rgba(20, 9, 38, 0.76)',
      labelBorder: 'rgba(200, 160, 255, 0.22)',
      labelShadow: '0 1px 3px #000',
      selBorder: '#ff7ac8',
      codeBg: 'rgba(255, 255, 255, 0.07)',
      shadow: '0 10px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 122, 200, 0.05)',
      wordmark: 'linear-gradient(#f5ebff, #f5ebff)',
      logo: 'linear-gradient(135deg, #ff7ac8, #9a6cf2 60%, #5b3fd0)',
      evAdded: '#ff9ad6',
      evWoke: '#9a6cf2',
      evSuspended: '#8a7bb5',
      evCrashed: '#e8306b',
      evTask: '#b09000',
      evRemoved: '#6f6390',
      evWorker: '#c49cff',
      evMeta: '#7e6ca6',
    },
  },
  {
    id: 'google-dark',
    name: 'Google Dark',
    mode: 'dark',
    scene: {
      background: '#202124',
      backgroundTop: '#141517',
      fog: '#202124',
      fogDensity: 0.004,
      grid: '#5f6368',
      gridAlpha: 0.3,
      sea: '#202124',
      seaAlpha: 0.9,
      stars: null,
      starAlpha: 0,
    },
    island: {
      fill: '#2a2b2e',
      side: '#1b1c1e',
      edge: '#a770ef',
      edgeAlpha: 0.65,
      label: '#5f6368',
    },
    district: {
      fill: '#303134',
      fillJitter: 0,
      edge: '#3c4043',
      edgeAlpha: 1,
      dots: '#3c4043',
      label: '#e8eaed',
    },
    worker: {
      pad: '#303134',
      padEdge: '#5f6368',
      idle: '#2a2b2e',
      active: '#34a853',
      draining: '#af5cf7',
      highlight: '#8ab4f8',
      fill: '#8ab4f8',
      full: '#fbbc04',
      track: '#3c4043',
      parked: '#252629',
    },
    router: { shaft: '#3c4043', emissive: '#121212', band: '#8ab4f8', beacon: '#a770ef' },
    links: {
      color: '#8ab4f8',
      alpha: 0.14,
      highlight: '#8ab4f8',
      flow: '#aecbfa',
      focusAlpha: 0.88,
    },
    team: { saturation: 0.5, lightness: 0.6, alpha: 0.26 },
    states: {
      running: '#34a853',
      changing: '#af5cf7',
      suspended: '#5f6368',
      crashed: '#e52592',
      pending: '#fbbc04',
    },
    effects: {
      wake: '#81c995',
      suspend: '#9aa0a6',
      crash: '#e52592',
      beam: '#8ab4f8',
      removed: '#5f6368',
    },
    marker: { select: '#8ab4f8', hover: '#a770ef' },
    glow: {
      additive: true,
      emissive: 0.5,
      ambient: 0.16,
      diffuse: 0.5,
      hemi: 0.22,
      gloss: 0,
      ink: 0,
      occlusion: 0.15,
    },
    bloom: { strength: 0.3, radius: 0.3, threshold: 0.75 },
    light: {
      toneMapping: 'neutral',
      exposure: 1.0,
      ambient: '#303134',
      ambientIntensity: 0.5,
      hemiSky: '#e8eaed',
      hemiGround: '#202124',
      hemiIntensity: 0.95,
      sun: '#ffffff',
      sunIntensity: 1.3,
      shadow: false,
      shadowAlpha: 0,
    },
    ui: {
      glass: 'rgba(42, 43, 46, 0.95)',
      glassStrong: 'rgba(42, 43, 46, 0.98)',
      line: '#3c4043',
      text: '#e8eaed',
      text2: '#bdc1c6',
      muted: '#9aa0a6',
      accent: '#8ab4f8',
      accentText: '#202124',
      chipBg: '#303134',
      chipHover: '#3c4043',
      inputBg: '#303134',
      btnBg: '#303134',
      btnBorder: '#5f6368',
      btnText: '#8ab4f8',
      btnHover: '#3c4043',
      primaryBg: '#8ab4f8',
      primaryBorder: '#8ab4f8',
      primaryText: '#202124',
      warnBg: 'rgba(175, 92, 247, 0.12)',
      warnBorder: '#af5cf7',
      labelBg: 'rgba(48, 49, 52, 0.95)',
      labelBorder: '#3c4043',
      labelShadow: 'none',
      selBorder: '#a770ef',
      codeBg: '#303134',
      shadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
      logo: 'linear-gradient(135deg, #217bfe 0%, #078efb 33%, #a770ef 66%, #ff5e62 100%)',
      wordmark: 'linear-gradient(90deg, #217bfe 0%, #078efb 33%, #a770ef 66%, #ff5e62 100%)',
      evAdded: '#8ab4f8',
      evWoke: '#34a853',
      evSuspended: '#9aa0a6',
      evCrashed: '#e52592',
      evTask: '#af5cf7',
      evRemoved: '#5f6368',
      evWorker: '#81c995',
      evMeta: '#5f6368',
    },
  },
  {
    id: 'glacier',
    name: 'Glacier',
    mode: 'light',
    scene: {
      background: '#eef4fb',
      backgroundTop: '#fafdff',
      fog: '#eef4fb',
      fogDensity: 0.003,
      grid: '#7fa6d6',
      gridAlpha: 0.32,
      sea: '#e3edf8',
      seaAlpha: 0.75,
      stars: null,
      starAlpha: 0,
    },
    island: { fill: '#ffffff', side: '#a9c8ee', edge: '#4f8fe8', edgeAlpha: 1, label: '#8fb0d8' },
    district: {
      fill: '#f2f7fd',
      fillJitter: 0.04,
      edge: '#b0c8e6',
      edgeAlpha: 1,
      dots: '#c8d8ec',
      label: '#0f2340',
    },
    worker: {
      pad: '#ffffff',
      padEdge: '#9fbbe0',
      idle: '#e5eef9',
      active: '#0062e6',
      draining: '#9a7a00',
      highlight: '#7c3aed',
      fill: '#0062e6',
      full: '#c25e00',
      track: '#d8e3f1',
      parked: '#f8fbfe',
    },
    router: { shaft: '#e6eff9', emissive: '#000000', band: '#4a86e0', beacon: '#7fb0f0' },
    links: {
      color: '#0062e6',
      alpha: 0.25,
      highlight: '#7c3aed',
      flow: '#0062e6',
      focusAlpha: 0.9,
    },
    team: { saturation: 0.6, lightness: 0.72, alpha: 0.55 },
    states: {
      running: '#0062e6',
      changing: '#9a7a00',
      suspended: '#b7c6da',
      crashed: '#d11f6f',
      pending: '#c25e00',
    },
    effects: {
      wake: '#0062e6',
      suspend: '#8ea3c2',
      crash: '#d11f6f',
      beam: '#5b9cf5',
      removed: '#a6b4c8',
    },
    marker: { select: '#0f2340', hover: '#7c3aed' },
    glow: {
      additive: false,
      emissive: 0.1,
      ambient: 0.66,
      diffuse: 0.36,
      hemi: 0.1,
      gloss: 0.2,
      ink: 0.3,
      occlusion: 0.25,
    },
    bloom: { strength: 0, radius: 0.4, threshold: 0.95 },
    light: {
      toneMapping: 'none',
      exposure: 1.0,
      ambient: '#ffffff',
      ambientIntensity: 0.65,
      hemiSky: '#ffffff',
      hemiGround: '#d4e2f2',
      hemiIntensity: 1.3,
      sun: '#f6fbff',
      sunIntensity: 1.5,
      shadow: true,
      shadowAlpha: 0.45,
    },
    ui: {
      glass: 'rgba(255, 255, 255, 0.84)',
      glassStrong: 'rgba(255, 255, 255, 0.95)',
      line: 'rgba(15, 35, 64, 0.14)',
      text: '#0f2340',
      text2: '#33507a',
      muted: '#536889',
      accent: '#7c3aed',
      accentText: '#ffffff',
      chipBg: 'rgba(15, 35, 64, 0.04)',
      chipHover: 'rgba(124, 58, 237, 0.1)',
      inputBg: 'rgba(255, 255, 255, 0.88)',
      btnBg: 'rgba(124, 58, 237, 0.07)',
      btnBorder: 'rgba(124, 58, 237, 0.4)',
      btnText: '#3b1a8a',
      btnHover: 'rgba(124, 58, 237, 0.14)',
      primaryBg: '#7c3aed',
      primaryBorder: '#6a2bd8',
      primaryText: '#ffffff',
      warnBg: 'rgba(154, 122, 0, 0.1)',
      warnBorder: 'rgba(154, 122, 0, 0.45)',
      labelBg: 'rgba(255, 255, 255, 0.92)',
      labelBorder: 'rgba(15, 35, 64, 0.16)',
      labelShadow: 'none',
      selBorder: '#7c3aed',
      codeBg: 'rgba(0, 98, 230, 0.07)',
      shadow: '0 10px 30px rgba(15, 35, 64, 0.12), 0 1px 3px rgba(15, 35, 64, 0.08)',
      wordmark: 'linear-gradient(#0f2340, #0f2340)',
      logo: 'linear-gradient(135deg, #7fb0f0, #0062e6 55%, #7c3aed)',
      evAdded: '#7c3aed',
      evWoke: '#0062e6',
      evSuspended: '#8ea3c2',
      evCrashed: '#d11f6f',
      evTask: '#9a7a00',
      evRemoved: '#a6b4c8',
      evWorker: '#4a86e0',
      evMeta: '#a6b4c8',
    },
  },
  {
    id: 'volt-noir',
    name: 'Volt Noir',
    mode: 'dark',
    scene: {
      background: '#0c0c0f',
      backgroundTop: '#16161b',
      fog: '#0c0c0f',
      fogDensity: 0.0045,
      grid: '#c6ff3d',
      gridAlpha: 0.12,
      sea: '#101014',
      seaAlpha: 0.9,
      stars: null,
      starAlpha: 0,
    },
    island: { fill: '#18181d', side: '#0f0f12', edge: '#c6ff3d', edgeAlpha: 1, label: '#6c6c78' },
    district: {
      fill: '#1d1d23',
      fillJitter: 0,
      edge: '#4a4a56',
      edgeAlpha: 0.9,
      dots: '#33333c',
      label: '#f5f5f7',
    },
    worker: {
      pad: '#1f1f25',
      padEdge: '#c6ff3d',
      idle: '#2a2a32',
      active: '#6aa61a',
      draining: '#2f95c8',
      highlight: '#e2ff9a',
      fill: '#6aa61a',
      full: '#ffb347',
      track: '#2a2a32',
      parked: '#121216',
    },
    router: { shaft: '#222228', emissive: '#0c0c0f', band: '#c6ff3d', beacon: '#e6ffa8' },
    links: {
      color: '#6f9a1f',
      alpha: 0.1,
      highlight: '#e2ff9a',
      flow: '#c6ff3d',
      focusAlpha: 0.85,
    },
    team: { saturation: 0.5, lightness: 0.58, alpha: 0.24 },
    states: {
      running: '#6aa61a',
      changing: '#2f95c8',
      suspended: '#3a3a44',
      crashed: '#e83a8a',
      pending: '#f59e0b',
    },
    effects: {
      wake: '#b6f25a',
      suspend: '#70707e',
      crash: '#e83a8a',
      beam: '#d8ff8a',
      removed: '#5a5a66',
    },
    marker: { select: '#ffffff', hover: '#e6ffa8' },
    glow: {
      additive: true,
      emissive: 0.95,
      ambient: 0.12,
      diffuse: 0.5,
      hemi: 0.2,
      gloss: 0,
      ink: 0,
      occlusion: 0.2,
    },
    bloom: { strength: 0.55, radius: 0.3, threshold: 0.62 },
    light: {
      toneMapping: 'neutral',
      exposure: 1.0,
      ambient: '#1a1a20',
      ambientIntensity: 0.45,
      hemiSky: '#e8e8f0',
      hemiGround: '#0c0c0f',
      hemiIntensity: 0.85,
      sun: '#ffffff',
      sunIntensity: 1.5,
      shadow: false,
      shadowAlpha: 0,
    },
    ui: {
      glass: 'rgba(20, 20, 24, 0.84)',
      glassStrong: 'rgba(14, 14, 17, 0.95)',
      line: 'rgba(255, 255, 255, 0.12)',
      text: '#f5f5f7',
      text2: '#cacad2',
      muted: '#9c9ca8',
      accent: '#c6ff3d',
      accentText: '#0c0c0f',
      chipBg: 'rgba(255, 255, 255, 0.04)',
      chipHover: 'rgba(198, 255, 61, 0.1)',
      inputBg: 'rgba(0, 0, 0, 0.4)',
      btnBg: 'rgba(255, 255, 255, 0.05)',
      btnBorder: 'rgba(198, 255, 61, 0.55)',
      btnText: '#f2ffd6',
      btnHover: 'rgba(198, 255, 61, 0.14)',
      primaryBg: '#c6ff3d',
      primaryBorder: '#d8ff7a',
      primaryText: '#0c0c0f',
      warnBg: 'rgba(47, 149, 200, 0.12)',
      warnBorder: 'rgba(47, 149, 200, 0.55)',
      labelBg: 'rgba(12, 12, 15, 0.84)',
      labelBorder: 'rgba(255, 255, 255, 0.14)',
      labelShadow: 'none',
      selBorder: '#c6ff3d',
      codeBg: 'rgba(255, 255, 255, 0.07)',
      shadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
      wordmark: 'linear-gradient(#f5f5f7, #f5f5f7)',
      logo: 'linear-gradient(135deg, #c6ff3d 50%, #0c0c0f 50%)',
      evAdded: '#c6ff3d',
      evWoke: '#6aa61a',
      evSuspended: '#7a7a88',
      evCrashed: '#e83a8a',
      evTask: '#2f95c8',
      evRemoved: '#5a5a66',
      evWorker: '#b6f25a',
      evMeta: '#6c6c78',
    },
  },
  {
    id: 'riso-paper',
    name: 'Riso Paper',
    mode: 'light',
    scene: {
      background: '#f6f1e7',
      backgroundTop: '#faf6ee',
      fog: '#f6f1e7',
      fogDensity: 0.003,
      grid: '#3a5bd9',
      gridAlpha: 0.16,
      sea: '#efe8da',
      seaAlpha: 0.75,
      stars: null,
      starAlpha: 0,
    },
    island: {
      fill: '#fbf8f1',
      side: '#ff48b0',
      edge: '#1f1d1a',
      edgeAlpha: 0.85,
      label: '#ff48b0',
    },
    district: {
      fill: '#f1ebdd',
      fillJitter: 0.03,
      edge: '#1f1d1a',
      edgeAlpha: 0.45,
      dots: '#cdc2ab',
      label: '#1f1d1a',
    },
    worker: {
      pad: '#fbf8f1',
      padEdge: '#1f1d1a',
      idle: '#ece4d4',
      active: '#009a93',
      draining: '#3a5bd9',
      highlight: '#ff48b0',
      fill: '#009a93',
      full: '#c25e00',
      track: '#e2d9c6',
      parked: '#f6f1e5',
    },
    router: { shaft: '#ece4d4', emissive: '#000000', band: '#ff48b0', beacon: '#ff48b0' },
    links: { color: '#3a5bd9', alpha: 0.3, highlight: '#ff48b0', flow: '#3a5bd9', focusAlpha: 0.9 },
    team: { saturation: 0.55, lightness: 0.7, alpha: 0.55 },
    states: {
      running: '#009a93',
      changing: '#3a5bd9',
      suspended: '#c9c0b0',
      crashed: '#e5392b',
      pending: '#c25e00',
    },
    effects: {
      wake: '#009a93',
      suspend: '#a39a8a',
      crash: '#e5392b',
      beam: '#3a5bd9',
      removed: '#b0a796',
    },
    marker: { select: '#1f1d1a', hover: '#ff48b0' },
    glow: {
      additive: false,
      emissive: 0.04,
      ambient: 0.74,
      diffuse: 0.28,
      hemi: 0.06,
      gloss: 0,
      ink: 0.6,
      occlusion: 0.12,
    },
    bloom: { strength: 0, radius: 0.4, threshold: 0.95 },
    light: {
      toneMapping: 'none',
      exposure: 1.0,
      ambient: '#ffffff',
      ambientIntensity: 0.7,
      hemiSky: '#ffffff',
      hemiGround: '#e8dfcc',
      hemiIntensity: 1.2,
      sun: '#fffaf0',
      sunIntensity: 1.2,
      shadow: true,
      shadowAlpha: 0.4,
    },
    ui: {
      glass: 'rgba(251, 248, 241, 0.88)',
      glassStrong: 'rgba(250, 246, 238, 0.96)',
      line: 'rgba(31, 29, 26, 0.2)',
      text: '#1f1d1a',
      text2: '#433e37',
      muted: '#686157',
      accent: '#ff48b0',
      accentText: '#1f1d1a',
      chipBg: 'rgba(31, 29, 26, 0.04)',
      chipHover: 'rgba(255, 72, 176, 0.14)',
      inputBg: 'rgba(255, 255, 255, 0.75)',
      btnBg: 'rgba(255, 72, 176, 0.08)',
      btnBorder: '#1f1d1a',
      btnText: '#1f1d1a',
      btnHover: 'rgba(255, 72, 176, 0.2)',
      primaryBg: '#ff48b0',
      primaryBorder: '#1f1d1a',
      primaryText: '#1f1d1a',
      warnBg: 'rgba(58, 91, 217, 0.08)',
      warnBorder: 'rgba(58, 91, 217, 0.5)',
      labelBg: 'rgba(251, 248, 241, 0.94)',
      labelBorder: 'rgba(31, 29, 26, 0.35)',
      labelShadow: 'none',
      selBorder: '#ff48b0',
      codeBg: 'rgba(58, 91, 217, 0.08)',
      shadow: '4px 4px 0 rgba(255, 72, 176, 0.35)',
      wordmark: 'linear-gradient(#1f1d1a, #1f1d1a)',
      logo: 'linear-gradient(135deg, #ff48b0 50%, #3a5bd9 50%)',
      evAdded: '#ff48b0',
      evWoke: '#009a93',
      evSuspended: '#a39a8a',
      evCrashed: '#e5392b',
      evTask: '#3a5bd9',
      evRemoved: '#b0a796',
      evWorker: '#009a93',
      evMeta: '#b0a796',
    },
  },
];

export const DEFAULT_THEME = 'abyss-neon';

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME);
}

export const AURORA = ['#217bfe', '#078efb', '#a770ef', '#ff5e62'];

export function routerPalette(theme) {
  if (theme.id.startsWith('google-')) return AURORA;
  return [theme.router.band, theme.router.beacon, theme.effects.wake, theme.island.edge];
}

export function token(theme, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), theme);
}

export function parseColor(s) {
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`bad color ${s}`);
}

export function luminance(c) {
  const { r, g, b } = typeof c === 'string' ? parseColor(c) : c;
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function inkOn(bg, dark = '#0b0b10', light = '#ffffff') {
  return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
}

export function hex(s) {
  return parseInt(s.slice(1), 16);
}

export function classColor(theme, cls) {
  return theme.states[cls === 'transition' ? 'changing' : cls] || theme.states.running;
}

const kebab = (s) => s.replace(/[A-Z0-9]+/g, (m) => '-' + m.toLowerCase());

export function cssVars(theme) {
  const v = { '--bg': theme.scene.background };
  for (const [k, val] of Object.entries(theme.ui)) v[`--${kebab(k)}`] = val;
  for (const cls of ['running', 'transition', 'suspended', 'crashed', 'pending']) {
    v[`--${cls}`] = classColor(theme, cls);
  }
  for (const k of Object.keys(theme.ui).filter((x) => x.startsWith('ev'))) {
    v[`--${kebab(k)}-ink`] = inkOn(theme.ui[k]);
  }
  for (const cls of ['running', 'transition', 'suspended', 'crashed', 'pending']) {
    v[`--${cls}-ink`] = inkOn(classColor(theme, cls));
  }
  return v;
}

const STORE = 'ephemeris-decks:theme';

function stored() {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

function swatch(t) {
  const c = [t.scene.background, t.states.running, t.states.changing, t.ui.accent];
  return `<span class="theme-sw" style="--s0:${c[0]};--s1:${c[1]};--s2:${c[2]};--s3:${c[3]}"><i></i><i></i><i></i></span>`;
}

export class ThemePicker {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    const params = new URLSearchParams(window.location.search);
    const want = params.get('theme') || stored();
    this.theme = themeById(want);

    root.innerHTML = `<button class="theme-btn" aria-haspopup="listbox" aria-expanded="false" title="Switch Dark / Light Theme"></button>
      <div class="theme-menu" role="listbox" aria-label="Theme" hidden>
        ${THEMES.map(
          (t) =>
            `<button role="option" class="theme-opt" data-id="${t.id}">${swatch(t)}<span class="theme-name">${t.name}</span><span class="theme-mode">${t.mode}</span></button>`
        ).join('')}
      </div>`;
    this.btn = root.querySelector('.theme-btn');
    this.menu = root.querySelector('.theme-menu');
    this.btn.addEventListener('click', () => this.open(this.menu.hidden));
    this.menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.theme-opt');
      if (!opt) return;
      this.set(opt.dataset.id, true);
      this.open(false);
      this.btn.focus();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!root.contains(e.target)) this.open(false);
    });
    this.apply();
  }

  open(on) {
    this.menu.hidden = !on;
    this.btn.setAttribute('aria-expanded', String(on));
  }

  set(id, remember = false) {
    this.theme = themeById(id);
    if (remember) {
      try {
        localStorage.setItem(STORE, this.theme.id);
      } catch {
        /* ignore storage restrictions */
      }
      const url = new URL(window.location.href);
      url.searchParams.set('theme', this.theme.id);
      history.replaceState(null, '', url);
    }
    this.apply();
  }

  apply() {
    const t = this.theme;
    const style = document.documentElement.style;
    for (const [k, v] of Object.entries(cssVars(t))) style.setProperty(k, v);
    document.documentElement.dataset.theme = t.id;
    document.documentElement.dataset.mode = t.mode;
    document.documentElement.style.colorScheme = t.mode;
    this.btn.innerHTML = `${swatch(t)}<span class="theme-name">${t.name}</span><span class="caret">▾</span>`;
    this.menu
      .querySelectorAll('.theme-opt')
      .forEach((o) => o.setAttribute('aria-selected', String(o.dataset.id === t.id)));
    this.onChange?.(t);
  }
}
