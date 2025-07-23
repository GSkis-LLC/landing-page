// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  redirects: {
    '/mymeetings': '/myMeetings',
    '/MyMeetings': '/myMeetings',
    '/MYMEETINGS': '/myMeetings',
    '/mymeetings/privacypolicy': '/myMeetings/privacyPolicy',
    '/mymeetings/termsofservice': '/myMeetings/termsOfService'
  }
});
