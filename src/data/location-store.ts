export interface Intergroup {
  name: string;
  url?: string;
  phone?: string;
}

export interface LocationConfig {
  city: string;
  stateAbbr: string;
  stateFull: string;
  geoRegion: string;
  slug: string;
  lat: number;
  lng: number;
  areaDescription: string;
  neighborhoods: string;
  // Optional enriched fields
  intergroup?: Intergroup;
  meetingHighlights?: string;
  transitInfo?: string;
  population?: number;
}

export interface LocationWithSlugs extends LocationConfig {
  stateSlug: string;
  citySlug: string;
}

type StateLocations = Record<string, LocationConfig>;

type GlobModule = { default: StateLocations };

const stateModules = import.meta.glob('./locations/states/*.json', { eager: true }) as Record<string, GlobModule>;

const locationsByState: Record<string, StateLocations> = {};

for (const [filePath, mod] of Object.entries(stateModules)) {
  const stateSlug = filePath.split('/').pop()?.replace('.json', '');
  if (stateSlug) {
    locationsByState[stateSlug] = mod.default;
  }
}

// Helper to convert string to kebab-case slug
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Calculate distance between two points using Haversine formula
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get all locations as flat array with slugs for routing
export function getAllLocations(): LocationWithSlugs[] {
  const result: LocationWithSlugs[] = [];
  for (const [stateSlug, cities] of Object.entries(locationsByState)) {
    for (const [citySlug, config] of Object.entries(cities)) {
      result.push({
        ...config,
        stateSlug,
        citySlug,
      });
    }
  }
  return result;
}

// Get a specific location by state and city slugs
export function getLocation(stateSlug: string, citySlug: string): LocationConfig | null {
  const state = stateSlug.toLowerCase();
  const city = citySlug.toLowerCase();
  return locationsByState[state]?.[city] ?? null;
}

// Get all cities in a state
export function getCitiesInState(stateSlug: string): LocationConfig[] {
  const state = stateSlug.toLowerCase();
  const cities = locationsByState[state];
  if (!cities) return [];
  return Object.values(cities);
}

// Get all unique states
export function getAllStates(): string[] {
  return Object.keys(locationsByState);
}

// Expose the map for sitemap or other server-side consumers
export function getAllLocationsMap(): Record<string, StateLocations> {
  return locationsByState;
}
