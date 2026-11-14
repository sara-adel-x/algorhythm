import type { IncomingMessage, ServerResponse } from 'node:http'
export function handleNasa(req: IncomingMessage, res: ServerResponse): Promise<void>
export function nasaMiddleware(): (req: IncomingMessage, res: ServerResponse, next: () => void) => void
