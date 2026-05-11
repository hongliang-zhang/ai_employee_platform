import type { ActionDefinition } from './types.js'
import { searchWeb } from './actions/search-web.js'
import { getWeather } from './actions/get-weather.js'

export const registry = new Map<string, ActionDefinition>([
  ['search_web', searchWeb],
  ['get_weather', getWeather],
])
