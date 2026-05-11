import Firecrawl from '@mendable/firecrawl-js'
import type { ActionDefinition } from '../types.js'

const DEFAULT_LIMIT = 5

export const searchWeb: ActionDefinition = {
  name: 'search_web',
  description: 'Search the web for recent information and return relevant results',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      limit: { type: 'number', description: `Max number of results to return (default ${DEFAULT_LIMIT})` },
    },
    required: ['query'],
  },
  async execute(input, _context) {
    const { query, limit = DEFAULT_LIMIT } = input as { query: string; limit?: number }
    const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY })
    const response = await client.search(query, { limit })
    const results = (response.data ?? []).map((r: any) => ({
      title: r.title as string | undefined,
      url: r.url as string | undefined,
      description: r.description as string | undefined,
    }))
    return { query, results }
  },
}
