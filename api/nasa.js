import { handleNasa } from '../server/nasa.mjs'

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const route = url.searchParams.get('__path')
  if (route) {
    url.pathname = `/api/nasa/${route}`
    url.searchParams.delete('__path')
    req.url = `${url.pathname}${url.search}`
  }
  return handleNasa(req, res)
}
