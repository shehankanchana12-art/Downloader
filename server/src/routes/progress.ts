import { Router } from 'express'

import { getOrCreateJob, streamJob } from '../jobs'
import { parseJobId } from '../validate'

export const progressRouter = Router()

progressRouter.get('/:jobId', (req, res, next) => {
  try {
    const jobId = parseJobId(req.params.jobId)
    const job = getOrCreateJob(jobId)
    res.setHeader('Cache-Control', 'no-store')
    streamJob(res, job)
  } catch (error) {
    next(error)
  }
})
