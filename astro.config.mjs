// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';
import mixpanel from "astrojs-mixpanel";

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [
    mixpanel({
      token: "e4e1730e6b5ed64f603144153755ce2e",
      config: {
        // Optional configuration options
        track_pageview: true,
        // @ts-ignore
        ignore_dnt: true,
      },
      autoTrack: true,
      globalProperties: {
        source: ({ url }) => {
          const params = new URLSearchParams(url.search);
          return params.get('source') || 'unknown';
        }
      }
    }),
  ],
});
