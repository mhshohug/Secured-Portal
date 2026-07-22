import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import path from 'path';

export class UploadService {
  static async uploadAvatar(file: any) {
    const fileExt = path.extname(file.originalname) || '.png';
    const fileName = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;

    if (supabase) {
      try {
        await supabase.storage.createBucket('profile_photos', { public: true }).catch(() => {});
        const { error } = await supabase.storage.from('profile_photos').upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

        if (!error) {
          const { data: publicUrlData } = supabase.storage.from('profile_photos').getPublicUrl(fileName);
          if (publicUrlData && publicUrlData.publicUrl) {
            return publicUrlData.publicUrl;
          }
        }
      } catch (err) {
        logger.warn("Supabase avatar storage fallback:", err);
      }
    }

    const base64 = file.buffer.toString('base64');
    return `data:${file.mimetype};base64,${base64}`;
  }

  static async uploadMedia(file: any) {
    const fileExt = path.extname(file.originalname) || '.bin';
    const filename = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;
    let mediaUrl = '';

    if (supabase) {
      try {
        await supabase.storage.createBucket('chat-media', { public: true }).catch(() => {});
        const { data, error } = await supabase.storage.from('chat-media').upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from('chat-media').getPublicUrl(filename);
          if (publicUrlData && publicUrlData.publicUrl) {
            mediaUrl = publicUrlData.publicUrl;
          }
        }
      } catch (err) {
        logger.warn("Supabase chat-media upload fallback:", err);
      }
    }

    if (!mediaUrl) {
      const base64 = file.buffer.toString('base64');
      mediaUrl = `data:${file.mimetype};base64,${base64}`;
    }

    return {
      mediaUrl,
      fileName: file.originalname,
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      mimetype: file.mimetype
    };
  }
}
