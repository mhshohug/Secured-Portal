import { Request, Response } from 'express';
import { UploadService } from '../services/uploadService';

export const uploadController = {
  uploadAvatar: async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const url = await UploadService.uploadAvatar(file);
      res.json({ status: 'success', url });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Upload failed." });
    }
  },

  uploadMedia: async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const result = await UploadService.uploadMedia(file);
      res.json({ status: 'success', ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  }
};
