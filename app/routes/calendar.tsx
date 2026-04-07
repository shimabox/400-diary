import { createRoute } from '~/factory'

export default createRoute(async (c) => {
  const year = c.req.query('year')
  return c.redirect(year ? `/?year=${year}` : '/')
})
