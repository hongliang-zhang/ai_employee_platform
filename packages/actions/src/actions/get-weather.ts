import type { ActionDefinition } from '../types.js'

export const getWeather: ActionDefinition = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  inputSchema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name or coordinates' },
    },
    required: ['location'],
  },
  async execute(input, _context) {
    const { location } = input as { location: string }
    // stub: 真实实现需要 WEATHER_API_KEY
    return { location, temperature: null, condition: 'unknown' }
  },
}
