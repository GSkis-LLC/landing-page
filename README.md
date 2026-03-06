## MyMeetings

MyMeetings is the #1 meeting finder for alcoholics anonymous. This repo contains the source code for the landing page

### Pages

- [Home](https://mymeetings.co/)
- [Meetings (directory landing)](https://mymeetings.co/meetings)
- [My Meetings landing](https://mymeetings.co/myMeetings)
- [My Meetings Privacy Policy](https://mymeetings.co/myMeetings/privacyPolicy)
- [My Meetings Terms of Service](https://mymeetings.co/myMeetings/termsOfService)

### Key Components

- [Header](src/components/Header.astro)
- [Meeting Map](src/components/MeetingMap.client.ts)
- [Meetings UI components](src/components/meetings)

### Data

- [Location store](src/data/location-store.ts)
- [State data](src/data/locations/states)

### Scripts

- [Sitemap generator](scripts/generate-sitemap.mjs)

### Development

Install and run the dev server:

- `npm install`
- `npm run dev`

Build and preview:

- `npm run build`
- `npm run preview`
