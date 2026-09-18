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

import * as THREE from 'three';

/**
 * Canonical Kubernetes 7-sided Heptagon Shield & Resource SVG Vector Paths
 * extracted from /kubernetes/community/icons/svg/resources/unlabeled/*.svg
 * (viewBox: 0 0 18.035334 17.500378, layer1 translate(-0.99262638,-1.174181)).
 */
const K8S_HEPTAGON_FILL =
  'm -6.8492015,4.2724668 a 1.1191255,1.1099671 0 0 0 -0.4288818,0.1085303 l -5.8524037,2.7963394 a 1.1191255,1.1099671 0 0 0 -0.605524,0.7529759 l -1.443828,6.2812846 a 1.1191255,1.1099671 0 0 0 0.151943,0.851028 1.1191255,1.1099671 0 0 0 0.06362,0.08832 l 4.0508,5.036555 a 1.1191255,1.1099671 0 0 0 0.874979,0.417654 l 6.4961011,-0.0015 a 1.1191255,1.1099671 0 0 0 0.8749788,-0.416906 L 1.3818872,15.149453 A 1.1191255,1.1099671 0 0 0 1.5981986,14.210104 L 0.15212657,7.9288154 A 1.1191255,1.1099671 0 0 0 -0.45339794,7.1758396 L -6.3065496,4.3809971 A 1.1191255,1.1099671 0 0 0 -6.8492015,4.2724668 Z';

const K8S_HEPTAGON_RIM =
  'M -6.8523435,3.8176372 A 1.1814304,1.171762 0 0 0 -7.3044284,3.932904 l -6.1787426,2.9512758 a 1.1814304,1.171762 0 0 0 -0.639206,0.794891 l -1.523915,6.6308282 a 1.1814304,1.171762 0 0 0 0.160175,0.89893 1.1814304,1.171762 0 0 0 0.06736,0.09281 l 4.276094,5.317236 a 1.1814304,1.171762 0 0 0 0.92363,0.440858 l 6.8576188,-0.0015 a 1.1814304,1.171762 0 0 0 0.9236308,-0.44011 l 4.2745966,-5.317985 a 1.1814304,1.171762 0 0 0 0.228288,-0.990993 L 0.53894439,7.6775738 A 1.1814304,1.171762 0 0 0 -0.10026101,6.8834313 L -6.2790037,3.9321555 A 1.1814304,1.171762 0 0 0 -6.8523435,3.8176372 Z m 0.00299,0.4550789 a 1.1191255,1.1099671 0 0 1 0.5426517,0.1085303 l 5.85315169,2.7948425 A 1.1191255,1.1099671 0 0 1 0.15197811,7.9290648 L 1.598051,14.21035 a 1.1191255,1.1099671 0 0 1 -0.2163123,0.939348 l -4.0493032,5.037304 a 1.1191255,1.1099671 0 0 1 -0.8749789,0.416906 l -6.4961006,0.0015 a 1.1191255,1.1099671 0 0 1 -0.874979,-0.417652 l -4.0508,-5.036554 a 1.1191255,1.1099671 0 0 1 -0.06362,-0.08832 1.1191255,1.1099671 0 0 1 -0.151942,-0.851028 l 1.443827,-6.2812853 a 1.1191255,1.1099671 0 0 1 0.605524,-0.7529758 l 5.8524036,-2.7963395 a 1.1191255,1.1099671 0 0 1 0.4288819,-0.1085303 z';

/**
 * Official inner SVG paths per Kubernetes resource kind.
 */
export const K8S_RESOURCE_ICON_SPECS = {
  Cluster: {
    abbr: 'cp',
    translate: [0, 0],
    ops: [
      {
        type: 'fill',
        d: 'm 9.9922574,5.0101373 c -0.1383234,-0.0044 -3.9953139,1.8917791 -4.0457429,1.9890241 -0.121153,0.233682 -0.998802,4.2814776 -0.947235,4.3687236 0.03,0.05065 0.662199,0.852305 1.404567,1.780771 l 1.349798,1.687754 2.2215743,0.0011 2.2215722,0.0011 1.412819,-1.765784 1.41388,-1.765265 -0.49456,-2.1688599 C 14.25673,7.9459603 14.01329,6.9504204 13.98842,6.9264304 13.91892,6.8595504 10.06724,5.0126913 9.9922574,5.0102703 Z m 0.2361666,1.9828241 c 0.186637,0.008 0.205792,0.291571 0.605128,0.321427 0.5216,0.039 0.465508,-0.446651 0.864553,-0.108522 0.399044,0.338125 -0.0889,0.362641 0.03514,0.870749 0.12409,0.5081041 0.568801,0.3050991 0.370523,0.7890987 -0.198279,0.484002 -0.372613,0.02728 -0.81751,0.302308 C 10.841361,9.443045 11.171694,9.803368 10.65012,9.764369 10.128468,9.725369 10.509653,9.4183041 10.11061,9.0801721 9.711566,8.7420403 9.4703718,9.1676321 9.3463088,8.6595245 9.2222188,8.1514164 9.632244,8.4185073 9.830523,7.9345055 10.029224,7.4504584 9.5494288,7.3532524 9.9943524,7.0782264 c 0.05564,-0.03434 0.1018906,-0.05688 0.1421056,-0.07028 0.03508,-0.01167 0.06533,-0.01614 0.09197,-0.01497 z m 0.521493,0.572059 c -0.07578,-5.306e-4 -0.151209,0.01021 -0.223758,0.03204 -0.400393,0.120732 -0.626954,0.5433219 -0.505909,0.943613 0.12094,0.3999197 0.54311,0.6261487 0.943107,0.5053937 0.399838,-0.120746 0.626268,-0.5426107 0.505909,-0.9425788 C 11.373516,7.7856684 11.081837,7.5673344 10.749917,7.5650224 Z M 7.7572695,8.8667481 c 0.03969,7.9e-4 0.08832,0.009 0.1482991,0.02739 0.4799279,0.147138 -0.0077,0.399503 0.334354,0.7668789 0.3420531,0.367377 0.6285182,-0.101086 0.7410452,0.388091 0.112527,0.489177 -0.3499913,0.192921 -0.4971261,0.672827 -0.1471612,0.479904 0.4014791,0.494083 0.03411,0.836123 -0.367374,0.342041 -0.3418151,-0.20606 -0.8309501,-0.09353 -0.489188,0.112527 -0.227039,0.594654 -0.70694,0.447516 -0.479928,-0.147137 0.0077,-0.3995 -0.334354,-0.766876 -0.342054,-0.367379 -0.628518,0.100571 -0.741045,-0.388607 -0.112528,-0.48918 0.349991,-0.192924 0.497125,-0.672826 0.147162,-0.479907 -0.401981,-0.49357 -0.03461,-0.8356099 0.367374,-0.342043 0.342291,0.2060649 0.831453,0.09354 0.428043,-0.09846 0.280643,-0.479607 0.558641,-0.474906 z m 3.5672165,0.524516 c 0.04551,5.36e-4 0.100807,0.01243 0.170022,0.03927 0.55327,0.2147389 -0.175234,0.5458939 0.253735,0.9560129 0.428969,0.410118 0.727472,-0.332741 0.966867,0.210323 0.239369,0.543065 -0.510434,0.262432 -0.497126,0.855763 0.01323,0.593331 0.749591,0.27872 0.534829,0.83199 -0.214709,0.553268 -0.545888,-0.175247 -0.955992,0.25373 -0.410131,0.428977 0.33221,0.726972 -0.210847,0.966348 -0.543057,0.23938 -0.261382,-0.509939 -0.854736,-0.496609 -0.593328,0.01333 -0.279215,0.749072 -0.83251,0.534334 C 9.3454848,13.327687 10.073987,12.996532 9.644993,12.586412 9.2160238,12.176292 8.9180238,12.919152 8.6786546,12.376089 8.4392867,11.833024 9.1885598,12.114176 9.1752778,11.520845 9.1617878,10.927514 8.4256867,11.241606 8.6404225,10.688336 8.8551588,10.135067 9.1868138,10.864099 9.596945,10.435122 10.007048,10.006146 9.2641778,9.707635 9.807262,9.468259 c 0.543055,-0.2393769 0.26191,0.509939 0.855237,0.496609 0.519192,-0.01167 0.343429,-0.5764079 0.661987,-0.5736079 z M 7.4430765,9.646544 c -0.417988,-1.58e-4 -0.756946,0.338564 -0.757078,0.756544 -1.59e-4,0.418182 0.338905,0.757219 0.757078,0.75706 C 7.8610396,11.16 8.1997585,10.821053 8.1996004,10.403088 8.1994675,9.985325 7.8608276,9.646692 7.4430765,9.646544 Z m 3.2535535,0.725021 c -0.615684,4.2e-5 -1.114846,0.498983 -1.11519,1.114661 -2.38e-4,0.616082 0.499109,1.11565 1.11519,1.115692 0.616268,2.22e-4 1.115907,-0.499425 1.115669,-1.115692 0,-0.615866 -0.499798,-1.114883 -1.115669,-1.114661 z',
      },
    ],
  },
  Pod: {
    abbr: 'pod',
    translate: [0.12766661, 0.35147801],
    ops: [
      {
        type: 'fill',
        d: 'M 6.2617914,7.036086 9.8826317,5.986087 13.503462,7.036086 9.8826317,8.086087 Z',
      },
      { type: 'fill', d: 'm 6.2617914,7.43817 0,3.852778 3.3736103,1.868749 0.0167,-4.713193 z' },
      { type: 'fill', d: 'm 13.503462,7.43817 0,3.852778 -3.37361,1.868749 -0.0167,-4.713193 z' },
    ],
  },
  Deployment: {
    abbr: 'deploy',
    translate: [-0.65385546, 0.63370063],
    ops: [
      {
        type: 'fill',
        d: 'm 10.225062,13.731632 0,0 C 7.7824218,13.847177 5.7050116,11.968386 5.5753417,9.5264634 5.4456516,7.0845405 7.3124018,4.9962905 9.7535318,4.8524795 c 2.4411202,-0.143811 4.5401412,1.71081 4.6980812,4.1510682 l -1.757081,0.1137208 c -0.0954,-1.473818 -1.36311,-2.593935 -2.8374602,-2.50708 -1.47434,0.08686 -2.60178,1.3480761 -2.52346,2.8228991 0.0783,1.4748224 1.333,2.6095384 2.8082502,2.5397534 z',
      },
      { type: 'fill', d: 'm 11.135574,9.0088015 1.39745,3.4205085 3.2263,-3.4205085 z' },
    ],
  },
  ReplicaSet: {
    abbr: 'rs',
    translate: [0.16298107, 0.66894115],
    ops: [
      {
        type: 'stroke',
        fillColor: 'shield',
        d: 'm 8.123609,5.5524084 6.52499,0 0,4.5833346 -6.52499,0 z',
        width: 0.53,
        dash: [1.58, 1.58],
      },
      {
        type: 'stroke',
        fillColor: 'shield',
        d: 'm 6.5848588,6.9637194 6.5249902,0 0,4.5833346 -6.5249902,0 z',
        width: 0.53,
        dash: [1.58, 1.58],
      },
      { type: 'fill', d: 'm 5.0461088,8.3750314 6.5250002,0 0,4.5833346 -6.5250002,0 z' },
      {
        type: 'stroke',
        d: 'm 5.0461088,8.3750314 6.5250002,0 0,4.5833346 -6.5250002,0 z',
        width: 0.53,
      },
    ],
  },
  DaemonSet: {
    abbr: 'ds',
    translate: [0.58627835, 0.45731048],
    ops: [
      {
        type: 'stroke',
        fillColor: 'shield',
        d: 'm 7.708299,5.2827748 6.524989,0 0,4.5833348 -6.524989,0 z',
        width: 0.53,
        dash: [1.58, 1.58],
      },
      { type: 'stroke', d: 'm 4.350169,13.606752 7.074559,0', width: 0.62 },
      {
        type: 'stroke',
        fillColor: 'shield',
        d: 'm 6.169549,6.6940855 6.524989,0 0,4.5833355 -6.524989,0 z',
        width: 0.53,
        dash: [1.58, 1.58],
      },
      { type: 'fill', d: 'm 4.5865192,8.1226661 6.5250018,0 0,4.5833339 -6.5250018,0 z' },
    ],
  },
  StatefulSet: {
    abbr: 'sts',
    translate: [0.26877762, 1.0923105],
    ops: [
      {
        type: 'stroke',
        d: 'm 8.0530333,5.1290756 6.5250067,0 0,4.583335 -6.5250067,0 z',
        width: 0.53,
        dash: [1.58, 1.58],
      },
      {
        type: 'stroke',
        fillColor: 'shield',
        d: 'm 6.5142849,6.5403876 6.5250071,0 0,4.5833354 -6.5250071,0 z',
        width: 0.53,
        dash: [1.58, 1.58],
      },
      { type: 'fill', d: 'm 4.9755578,7.9516984 6.5249912,0 0,4.5833346 -6.5249912,0 z' },
      {
        type: 'stroke',
        d: 'm 4.9755578,7.9516984 6.5249912,0 0,4.5833346 -6.5249912,0 z',
        width: 0.53,
      },
      {
        type: 'stroke',
        strokeColor: 'shield',
        d: 'm 10.967067,9.2260482 0,0 c 0,0.4294054 -1.2219064,0.7775068 -2.7291777,0.7775068 -1.5072734,0 -2.7291614,-0.3481014 -2.7291614,-0.7775068 l 0,0 c 0,-0.4294054 1.221888,-0.7775054 2.7291614,-0.7775054 1.5072733,0 2.7291777,0.3481 2.7291777,0.7775054 l 0,2.1033228 c 0,0.429405 -1.2219064,0.777506 -2.7291777,0.777506 -1.5072734,0 -2.7291614,-0.348101 -2.7291614,-0.777506 l 0,-2.1033228',
        width: 0.55,
      },
    ],
  },
  Service: {
    abbr: 'svc',
    translate: [0.09238801, 0.66897746],
    ops: [
      { type: 'fill', d: 'm 4.4949896,11.260826 2.9083311,0 0,2.041667 -2.9083311,0 z' },
      { type: 'fill', d: 'm 8.4637407,11.260826 2.9083303,0 0,2.041667 -2.9083303,0 z' },
      { type: 'fill', d: 'm 12.432491,11.260826 2.90833,0 0,2.041667 -2.90833,0 z' },
      { type: 'fill', d: 'm 7.6137407,5.2082921 4.6083303,0 0,2.041667 -4.6083303,0 z' },
      {
        type: 'stroke',
        d: 'm 9.9179005,7.2499601 0,2.005449 -3.966671,0 0,2.0028859',
        width: 0.55,
      },
      {
        type: 'stroke',
        d: 'm 9.9179005,7.2499601 0,2.005449 3.9666705,0 0,2.0028859',
        width: 0.55,
      },
      { type: 'stroke', d: 'm 9.9095538,7.2512251 0,2.005449 0.0167,0 0,2.0028859', width: 0.55 },
    ],
  },
  HTTPRoute: {
    abbr: 'ing',
    translate: [0, 0],
    ops: [
      {
        type: 'fill',
        d: 'm 12.75799,13.997178 -2.270701,0 -4.9209009,-6.1558617 -1.42366,0 0,-2.0149069 2.31473,0 4.9230119,6.1558536 1.37752,0 0,-1.593474 3.119869,2.599882 -3.119869,2.601983 z m -2.47616,-4.7552751 1.09864,-1.3754256 1.37752,0 0,1.593475 3.119869,-2.5998829 -3.119869,-2.601983 0,1.593483 -2.270701,0 -1.4571904,1.8241102 z m -3.5979219,1.3649431 -1.11752,1.400578 -1.42366,0 0,2.014915 2.31473,0 1.4781699,-1.849278 z',
      },
    ],
  },
  Gateway: {
    abbr: 'gw',
    translate: [0, 0],
    ops: [
      {
        type: 'fill',
        d: 'm 12.75799,13.997178 -2.270701,0 -4.9209009,-6.1558617 -1.42366,0 0,-2.0149069 2.31473,0 4.9230119,6.1558536 1.37752,0 0,-1.593474 3.119869,2.599882 -3.119869,2.601983 z m -2.47616,-4.7552751 1.09864,-1.3754256 1.37752,0 0,1.593475 3.119869,-2.5998829 -3.119869,-2.601983 0,1.593483 -2.270701,0 -1.4571904,1.8241102 z m -3.5979219,1.3649431 -1.11752,1.400578 -1.42366,0 0,2.014915 2.31473,0 1.4781699,-1.849278 z',
      },
    ],
  },
  SparkApplication: {
    abbr: 'job',
    translate: [0.30405635, 1.0923112],
    ops: [
      { type: 'rect', x: 5.45, y: 10.88, w: 2.2, h: 2.14 },
      { type: 'rect', x: 8.6, y: 10.88, w: 2.2, h: 2.14 },
      { type: 'rect', x: 11.76, y: 10.88, w: 2.2, h: 2.14 },
      { type: 'rect', x: 11.76, y: 7.73, w: 2.2, h: 2.14 },
      { type: 'rect', x: 8.61, y: 7.76, w: 2.2, h: 2.14 },
      { type: 'rect', x: 5.47, y: 7.76, w: 2.2, h: 2.14 },
      { type: 'rect', x: 11.76, y: 4.64, w: 2.2, h: 2.14 },
    ],
  },
  RayCluster: {
    abbr: 'ray',
    translate: [0.30405635, 1.0923112],
    ops: [
      { type: 'rect', x: 5.45, y: 10.88, w: 2.2, h: 2.14 },
      { type: 'rect', x: 8.6, y: 10.88, w: 2.2, h: 2.14 },
      { type: 'rect', x: 11.76, y: 10.88, w: 2.2, h: 2.14 },
      { type: 'rect', x: 11.76, y: 7.73, w: 2.2, h: 2.14 },
      { type: 'rect', x: 8.61, y: 7.76, w: 2.2, h: 2.14 },
      { type: 'rect', x: 5.47, y: 7.76, w: 2.2, h: 2.14 },
      { type: 'rect', x: 11.76, y: 4.64, w: 2.2, h: 2.14 },
    ],
  },
};

const textureCache = new Map();

/**
 * Renders and caches an official Kubernetes community SVG icon onto a high-DPI THREE.CanvasTexture.
 *
 * @param {string} kind - Kubernetes resource kind ('Pod', 'Deployment', 'ReplicaSet', etc.).
 * @param {string} [fillColor='#326ce5'] - Heptagon shield CSS color.
 * @param {boolean} [isIncident=false] - Whether to render with high-alert red/amber glow.
 * @returns {THREE.CanvasTexture}
 */
export function getK8sIconTexture(kind = 'Pod', fillColor = '#326ce5', isIncident = false) {
  const shieldColor = isIncident ? '#ea4335' : fillColor || '#326ce5';
  const cacheKey = `${kind}:${shieldColor}:${isIncident}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const spec = K8S_RESOURCE_ICON_SPECS[kind] || K8S_RESOURCE_ICON_SPECS.Pod;

  if (
    ctx &&
    typeof Path2D !== 'undefined' &&
    typeof ctx.save === 'function' &&
    typeof ctx.translate === 'function'
  ) {
    ctx.save();
    // Map SVG viewBox (18.035334 x 17.500378) into 256x256 canvas with slight padding
    const scale = size / 19.6;
    ctx.translate(size * 0.04, size * 0.05);
    ctx.scale(scale, scale);

    // Apply Inkscape layer1 transform
    ctx.translate(-0.99262638, -1.174181);

    // 1. Draw Kubernetes 7-sided Heptagon Shield (g70 matrix)
    ctx.save();
    ctx.transform(1.0148887, 0, 0, 1.0148887, 16.902146, -2.698726);

    const fillPath = new Path2D(K8S_HEPTAGON_FILL);
    ctx.fillStyle = shieldColor;
    ctx.fill(fillPath);

    const rimPath = new Path2D(K8S_HEPTAGON_RIM);
    ctx.fillStyle = '#ffffff';
    ctx.fill(rimPath);
    ctx.restore();

    // 2. Draw Official Resource Symbol Vector Paths
    ctx.save();
    const [tx, ty] = spec.translate || [0, 0];
    ctx.translate(tx, ty);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';

    for (const op of spec.ops) {
      if (op.type === 'rect') {
        ctx.fillStyle = op.fillColor === 'shield' ? shieldColor : '#ffffff';
        ctx.fillRect(op.x, op.y, op.w, op.h);
      } else if (op.type === 'fill' && op.d) {
        ctx.fillStyle = op.fillColor === 'shield' ? shieldColor : '#ffffff';
        ctx.fill(new Path2D(op.d));
      } else if (op.type === 'stroke' && op.d) {
        const p2d = new Path2D(op.d);
        if (op.fillColor) {
          ctx.fillStyle = op.fillColor === 'shield' ? shieldColor : op.fillColor;
          ctx.fill(p2d);
        }
        ctx.strokeStyle = op.strokeColor === 'shield' ? shieldColor : '#ffffff';
        ctx.lineWidth = op.width || 0.53;
        if (op.dash && typeof ctx.setLineDash === 'function') {
          ctx.setLineDash(op.dash);
        } else if (typeof ctx.setLineDash === 'function') {
          ctx.setLineDash([]);
        }
        ctx.stroke(p2d);
      }
    }
    ctx.restore();
    ctx.restore();
  } else if (ctx) {
    // Fallback for headless test environments without global Path2D
    ctx.fillStyle = shieldColor;
    if (typeof ctx.beginPath === 'function') ctx.beginPath();
    if (typeof ctx.moveTo === 'function' && typeof ctx.lineTo === 'function') {
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const rx = 10 + Math.cos(angle) * 7.8;
        const ry = 10 + Math.sin(angle) * 7.8;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
    }
    if (typeof ctx.closePath === 'function') ctx.closePath();
    if (typeof ctx.fill === 'function') ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 4px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(spec.abbr.toUpperCase(), 10, 10);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates Top-Cap (+Y aerial view) and Front-Face (+Z zoomed-in view) surface medallion meshes
 * displaying the official Kubernetes SVG heptagon icon emblem.
 *
 * @param {string} kind
 * @param {string} fillColor
 * @param {boolean} isIncident
 * @param {{topRadius: number, topY: number, frontRadius: number, frontY?: number, frontZ: number}} opts
 * @returns {{topMedallion: THREE.Mesh, frontMedallion: THREE.Mesh}}
 */
export function createK8sSurfaceMedallions(
  kind = 'Pod',
  fillColor = '#326ce5',
  isIncident = false,
  opts = {}
) {
  const texture = getK8sIconTexture(kind, fillColor, isIncident);
  const topRadius = opts.topRadius ?? 0.24;
  const topY = opts.topY ?? 0.15;
  const frontRadius = opts.frontRadius ?? 0.16;
  const frontY = opts.frontY ?? 0;
  const frontZ = opts.frontZ ?? 0.3;

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });

  const topGeo = new THREE.CircleGeometry(topRadius, 7);
  const topMedallion = new THREE.Mesh(topGeo, mat);
  topMedallion.rotation.x = -Math.PI / 2;
  topMedallion.position.set(0, topY, 0);
  topMedallion.userData = {
    isIconEmblem: true,
    isTopMedallion: true,
    kind,
    isIncident,
  };

  const frontGeo = new THREE.CircleGeometry(frontRadius, 7);
  const frontMedallion = new THREE.Mesh(frontGeo, mat);
  frontMedallion.position.set(0, frontY, frontZ);
  frontMedallion.userData = {
    isIconEmblem: true,
    isFrontMedallion: true,
    kind,
    isIncident,
  };

  return { topMedallion, frontMedallion };
}

/**
 * Creates a floating 3D Sprite displaying the official Kubernetes SVG icon emblem.
 *
 * @param {string} kind
 * @param {string} fillColor
 * @param {boolean} isIncident
 * @param {number} [worldSize=0.38]
 * @returns {THREE.Sprite}
 */
export function createK8sIconSprite(
  kind = 'Pod',
  fillColor = '#326ce5',
  isIncident = false,
  worldSize = 0.38
) {
  const texture = getK8sIconTexture(kind, fillColor, isIncident);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(worldSize, worldSize, 1);
  sprite.userData = {
    isK8sIconEmblem: true,
    kind,
    isIncident,
  };
  return sprite;
}
