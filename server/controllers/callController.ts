import { Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { CallService } from '../services/callService';

export const callController = {
  getActiveCall: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const activeCall = await CallService.fetchActiveCall(decoded.uid);
      res.json({ status: 'success', call: activeCall });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  },

  postCallCrud: async (req: Request, res: Response) => {
    try {
      const decoded = await verifyToken(req);
      const { action, receiverId, type, status, durationSeconds, callId, callerId } = req.body;

      const targetCallId = callId || `call_${Date.now()}`;
      const actualCallerId = callerId || decoded.uid;
      const actualReceiverId = receiverId || '';

      if (action === 'initiate') {
        const newCall = {
          id: targetCallId,
          callerId: actualCallerId,
          receiverId: actualReceiverId,
          type: type || 'video',
          status: 'calling',
          durationSeconds: 0
        };
        await CallService.saveCall(newCall);
      } else if (action === 'update') {
        await CallService.updateCall(targetCallId, status, durationSeconds);
      } else if (action === 'end') {
        await CallService.updateCall(targetCallId, 'ended');
      }

      res.json({ status: 'success', callId: targetCallId });
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Unauthorized" });
    }
  }
};
