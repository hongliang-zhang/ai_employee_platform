import type { ActionDefinition } from './types.js'
import { searchWeb } from './actions/search-web.js'
import { getWeather } from './actions/get-weather.js'
import { kbSearch } from './actions/zhipu-kb.js'
import { tianyanchaEnrich } from './actions/tianyancha.js'
import { fxiaokeCreateLead, fxiaokeQueryLead } from './actions/fxiaoke.js'

export const registry = new Map<string, ActionDefinition>([
  ['search_web', searchWeb],
  ['get_weather', getWeather],
  ['kb_search', kbSearch],
  ['tianyancha_enrich', tianyanchaEnrich],
  ['fxiaoke_create_lead', fxiaokeCreateLead],
  ['fxiaoke_query_lead', fxiaokeQueryLead],
])
