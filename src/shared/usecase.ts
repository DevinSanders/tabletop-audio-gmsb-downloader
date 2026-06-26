/**
 * Tabletop Audio's "More filters" taxonomy (Civilization / Biome / Mood /
 * Action), sourced from tabletopaudio.com/bootstrap/js/tags_data.js + the site's
 * filter menu. The per-track membership comes from that file (keyed by track
 * number); the category labels below mirror the website's dropdowns.
 */

export type UseCaseCategory = 'civ' | 'biome' | 'mood' | 'action'

export interface UseCaseTags {
  civ: string[]
  biome: string[]
  mood: string[]
  action: string[]
}

export const USECASE_CATEGORIES: ReadonlyArray<UseCaseCategory> = ['civ', 'biome', 'mood', 'action']

export const USECASE_CATEGORY_LABELS: Record<UseCaseCategory, string> = {
  civ: 'Civilization',
  biome: 'Biome',
  mood: 'Mood',
  action: 'Action'
}

/** Option key -> friendly label, per category (matches the site's menu). */
export const USECASE_OPTIONS: Record<UseCaseCategory, Record<string, string>> = {
  civ: {
    cities: 'Cities & Towns',
    outposts: 'Camps & Outposts',
    public: 'Public Spaces & Markets',
    interiors: 'Interiors & Rooms',
    roads: 'Roads & Travel',
    transit: 'Transit & Stations',
    facilities: 'Facilities, Labs & Bases',
    ruins: 'Ruins & Pillaged',
    slums: 'Slums & Underbelly',
    temples: 'Temples & Magical'
  },
  biome: {
    forest: 'Forest & Jungle',
    desert: 'Desert & Desolate',
    ice: 'Ice & Snow',
    mountains: 'Mountains & Plains',
    swamp: 'Swamp & Marsh',
    underground: 'Underground',
    water: 'Water & Underwater',
    weather: 'Storms & Weather',
    planar: 'Otherworldly & Planar',
    hellscape: 'Hellscape & Lava'
  },
  mood: {
    peaceful: 'Peaceful & Tranquil',
    optimistic: 'Optimistic & Awe',
    fun: 'Lighthearted & Fun',
    somber: 'Reflective & Somber',
    dramatic: 'Dramatic & Serious',
    tension: 'Tension & Looming',
    mysterious: 'Mysterious & Unsettling',
    epic: 'Epic & Intense'
  },
  action: {
    explore: 'Explore & Journey',
    investigate: 'Investigate & Plan',
    celebrate: 'Celebrate & Festival',
    ritual: 'Ritual & Magic',
    sneak: 'Sneak & Track',
    chase: 'Chase & Escape',
    skirmish: 'Skirmish & Brawl',
    monster: 'Monster Encounter',
    war: 'Large Battle & War',
    boss: 'Boss Battle'
  }
}

export function emptyUseCase(): UseCaseTags {
  return { civ: [], biome: [], mood: [], action: [] }
}

/** Filter-id form used by the UI selection set, e.g. "mood:peaceful". */
export function useCaseId(category: UseCaseCategory, key: string): string {
  return `${category}:${key}`
}

/** All filter-ids a track carries, e.g. ["civ:cities", "mood:peaceful"]. */
export function useCaseIds(tags: UseCaseTags): string[] {
  return USECASE_CATEGORIES.flatMap((c) => tags[c].map((k) => useCaseId(c, k)))
}
