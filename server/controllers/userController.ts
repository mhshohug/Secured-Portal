import { Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { UserService } from '../services/userService';
import { FriendService } from '../services/friendService';

export const userController = {
  syncUser: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const user = await UserService.syncUser({
        uid: decoded.uid,
        fullName: req.body.fullName || req.body.name || decoded.name,
        email: req.body.email || decoded.email,
        phoneNumber: req.body.phone || req.body.phoneNumber,
        photoURL: req.body.avatar || req.body.photoURL || decoded.picture,
        bio: req.body.bio,
        statusMessage: req.body.status
      });
      res.json({ status: 'success', user });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  updateProfile: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const user = await UserService.updateUser(decoded.uid, req.body);
      res.json({ status: 'success', user });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  getProfile: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const user = await UserService.getUser(decoded.uid);
      res.json({ status: 'success', user });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  getAllUsers: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const users = await UserService.getAllUsers();
      res.json({ status: 'success', users });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  getContacts: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const users = await FriendService.fetchFriendsForUser(decoded.uid);
      res.json({ status: 'success', users });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  searchUsers: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const queryStr = (req.query.q || req.query.query || '') as string;
      const users = await FriendService.searchUsers(decoded.uid, queryStr);
      res.json({ status: 'success', users });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  }
};
