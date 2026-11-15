import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Async route wrapper — forwards rejected promises to Express' error handler
 * (Express 4 does not catch async errors by itself).
 */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
