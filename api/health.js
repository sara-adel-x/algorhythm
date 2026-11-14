import { handleNasa } from '../server/nasa.mjs'
export default function handler(req, res) {
  req.url = '/api/health'
  return handleNasa(req, res)
}
