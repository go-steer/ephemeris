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

// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

const BASE = '/ephemeris';

export default defineConfig({
  site: 'https://go-steer.github.io',
  base: BASE,
  integrations: [
    starlight({
      title: 'ephemeris',
      description: 'Generative spatial observability and ephemeral ArrowJS incident triage platform.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/go-steer/ephemeris',
        },
      ],
      plugins: [starlightLlmsTxt()],
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'Introduction', slug: '' },
            { label: 'Getting Started', slug: 'getting-started' },
            { label: 'Architecture', slug: 'architecture' },
          ],
        },
        {
          label: 'Core Systems',
          items: [
            { label: '3D Spatial Canvas', slug: 'spatial-canvas' },
            { label: 'Generative UI (ArrowJS)', slug: 'generative-ui' },
          ],
        },
      ],
    }),
  ],
});
