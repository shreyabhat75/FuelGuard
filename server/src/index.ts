import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { env } from './env'
import { connectDb, migrate } from './db'
import { runImport } from './import'
import { loginHandler } from './auth'
import { entriesRouter } from './routes/entries'
import { busesRouter } from './routes/buses'
import { flagsRouter } from './routes/flags'
import { approvalsRouter } from './routes/approvals'
import { statementsRouter } from './routes/statements'
import { miscRouter } from './routes/misc'

async function boot() {
  await connectDb()
  await migrate()
  const report = await runImport()
  console.log('[boot] data present:', report)

  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.corsOrigins, credentials: false }))
  app.use(express.json({ limit: '1mb' }))

  // Public
  app.post('/api/auth/login', loginHandler)

  // Promote ?token= to the Authorization header for evidence file URLs only
  // (they render inside <img> tags, which cannot send headers).
  app.use('/api', (req, _res, next) => {
    if (
      !req.headers.authorization &&
      typeof req.query.token === 'string' &&
      /^\/evidence\/[^/]+\/file$/.test(req.path)
    ) {
      req.headers.authorization = `Bearer ${req.query.token}`
    }
    next()
  })

  // Protected API surface (single mounts; routers define full sub-paths)
  app.use('/api', entriesRouter)
  app.use('/api', busesRouter)
  app.use('/api', flagsRouter)
  app.use('/api', approvalsRouter)
  app.use('/api', statementsRouter)
  app.use('/api', miscRouter)

  // 404 + error handling
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large (max 5 MB)' })
      return
    }
    console.error('[error]', err.message)
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' })
  })

  app.listen(env.port, () => {
    console.log(`[boot] fleetfuel-server listening on http://localhost:${env.port}/api/health`)
  })
}

boot().catch((e) => {
  console.error('[boot] fatal:', e)
  process.exit(1)
})
