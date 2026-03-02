import express from 'express';
import { healthCheck, detailedHealthCheck } from '../controllers/healthController.js';

const router = express.Router();

router.get('/', healthCheck);
router.get('/detailed', detailedHealthCheck);

export default router;
