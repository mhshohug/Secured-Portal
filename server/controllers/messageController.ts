import { Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { MessageService } from '../services/messageService';

export const messageController = {
  getMessages: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { partnerId } = req.query;
      if (!partnerId) {
        return res.status(400).json({ error: "partnerId query parameter is required." });
      }
      const messages = await MessageService.fetchMessagesBetween(decoded.uid, partnerId as string);
      res.json({ status: 'success', messages });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  postMessage: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { receiverId, content, type, mediaUrl, duration, replyTo, fileName, fileSize } = req.body;

      if (!receiverId) {
        return res.status(400).json({ error: "receiverId is required." });
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const nowIso = new Date().toISOString();

      const newMessage = {
        id: messageId,
        senderId: decoded.uid,
        receiverId,
        content: content || '',
        type: type || 'text',
        timestamp: nowIso,
        status: 'sent',
        mediaUrl: mediaUrl || '',
        fileName: fileName || '',
        fileSize: fileSize || '',
        duration: duration || '',
        replyTo: replyTo || undefined
      };

      await MessageService.saveMessage(newMessage);

      res.json({ status: 'success', messageId, message: newMessage });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  }
};
