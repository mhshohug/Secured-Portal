import { Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { FriendService } from '../services/friendService';

export const friendController = {
  getRequests: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const data = await FriendService.getFriendRequests(decoded.uid);
      res.json({ status: 'success', ...data });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  sendRequest: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { receiverId } = req.body;
      const result = await FriendService.sendFriendRequest(decoded.uid, receiverId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to send request" });
    }
  },

  acceptRequest: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { requestId, senderId } = req.body;
      const result = await FriendService.acceptFriendRequest(decoded.uid, requestId || senderId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to accept request" });
    }
  },

  declineRequest: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { requestId, senderId } = req.body;
      const result = await FriendService.declineFriendRequest(decoded.uid, requestId || senderId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to decline request" });
    }
  },

  cancelRequest: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { requestId, receiverId } = req.body;
      const result = await FriendService.cancelFriendRequest(decoded.uid, requestId || receiverId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to cancel request" });
    }
  },

  syncContacts: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { contacts } = req.body;
      const synced = await FriendService.syncContacts(decoded.uid, contacts);
      res.json({ status: 'success', users: synced });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to sync contacts" });
    }
  }
};
