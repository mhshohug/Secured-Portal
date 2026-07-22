import { Router } from 'express';
import multer from 'multer';
import { userController } from '../controllers/userController';
import { messageController } from '../controllers/messageController';
import { friendController } from '../controllers/friendController';
import { callController } from '../controllers/callController';
import { uploadController } from '../controllers/uploadController';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/config/supabase', (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  });
});

// User & Auth
router.post('/auth/sync', userController.syncUser);
router.post('/user/sync', userController.syncUser);
router.get('/user/profile', userController.getProfile);
router.post('/user/update', userController.updateProfile);
router.get('/users', userController.getAllUsers);
router.get('/contacts', userController.getContacts);
router.get('/users/search', userController.searchUsers);

// Messages
router.get('/messages', messageController.getMessages);
router.post('/messages', messageController.postMessage);

// Friends & Requests
router.get('/friend-requests', friendController.getRequests);
router.get('/friends/requests', friendController.getRequests);
router.post('/friend-request', friendController.sendRequest);
router.post('/friends/request', friendController.sendRequest);
router.post('/friend-request/accept', friendController.acceptRequest);
router.post('/friends/request/accept', friendController.acceptRequest);
router.post('/friends/accept', friendController.acceptRequest);
router.post('/friend-request/decline', friendController.declineRequest);
router.post('/friends/request/decline', friendController.declineRequest);
router.post('/friends/decline', friendController.declineRequest);
router.post('/friend-request/cancel', friendController.cancelRequest);
router.post('/friends/request/cancel', friendController.cancelRequest);
router.post('/friends/cancel', friendController.cancelRequest);
router.get('/friends/search', userController.searchUsers);
router.post('/contacts/sync', friendController.syncContacts);
router.post('/friends/sync-contacts', friendController.syncContacts);

// Calls
router.get('/calls', callController.getActiveCall);
router.post('/calls', callController.postCallCrud);

// Uploads
router.post('/upload/avatar', upload.single('avatar'), uploadController.uploadAvatar);
router.post('/upload', upload.single('file'), uploadController.uploadMedia);

export const apiRoutes = router;
