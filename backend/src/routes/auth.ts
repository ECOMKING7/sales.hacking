import { Router } from 'express';
import { register, login, me, logout } from '../controllers/authController';
import { verifyToken } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyToken, me);
router.post('/logout', logout);

export default router;
