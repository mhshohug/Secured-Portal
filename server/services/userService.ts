import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export const mapUserRecord = (row: any): any => {
  if (!row) return null;
  const uid = row.firebase_uid || row.id || row.uid;
  const name = row.full_name || row.name || row.display_name || '';
  const phone = row.phone_number || row.phone || row.mobile || '';
  const email = row.email || '';
  const avatar = row.photo_url || row.avatar || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${uid}`;
  const status = row.status_message || 'Available';
  const bio = row.bio || '';
  const createdAt = row.created_at;
  const isOnline = row.is_online !== undefined ? row.is_online : false;

  return {
    id: uid,
    uid,
    name,
    fullName: name,
    phone,
    phoneNumber: phone,
    email,
    avatar,
    photoURL: avatar,
    status,
    bio,
    isOnline,
    lastSeen: isOnline ? 'online' : (row.last_seen || 'offline'),
    typingTo: row.typing_to || '',
    createdAt: typeof createdAt === 'string' ? createdAt : (createdAt ? new Date(createdAt).toISOString() : undefined)
  };
};

export class UserService {
  static async getUser(uid: string) {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('firebase_uid', uid).maybeSingle();
      if (!error && data) {
        return mapUserRecord(data);
      }
    } catch (err) {
      logger.error("Error fetching user:", err);
    }
    return null;
  }

  static async syncUser(userObj: any) {
    const { uid, fullName, phoneNumber, email, photoURL, bio, statusMessage } = userObj;
    try {
      const existingUser = await this.getUser(uid);
      const nowIso = new Date().toISOString();

      if (existingUser) {
        const mappedUpdate: any = {
          is_online: true,
          updated_at: nowIso
        };
        if (!existingUser.fullName && fullName) mappedUpdate.full_name = fullName;
        if (!existingUser.phoneNumber && phoneNumber) mappedUpdate.phone_number = phoneNumber;
        if (!existingUser.email && email) mappedUpdate.email = email;
        if (!existingUser.photoURL && photoURL) mappedUpdate.photo_url = photoURL;
        if (!existingUser.bio && bio) mappedUpdate.bio = bio;
        if (!existingUser.status && statusMessage) mappedUpdate.status_message = statusMessage;

        const { data, error } = await supabase
          .from('users')
          .update(mappedUpdate)
          .eq('firebase_uid', uid)
          .select();

        if (!error && data && data.length > 0) {
          return mapUserRecord(data[0]);
        }
        return existingUser;
      } else {
        const newUserRecord = {
          firebase_uid: uid,
          full_name: fullName || 'Anonymous',
          phone_number: phoneNumber || null,
          email: email || '',
          photo_url: photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${uid}`,
          bio: bio || 'Hey there! I am using this secure chat.',
          status_message: statusMessage || 'Available',
          is_online: true,
          created_at: nowIso,
          updated_at: nowIso
        };

        const { data, error } = await supabase
          .from('users')
          .insert(newUserRecord)
          .select();

        if (!error && data && data.length > 0) {
          return mapUserRecord(data[0]);
        }
      }
    } catch (err) {
      logger.error("Error syncing user:", err);
    }
    return mapUserRecord(userObj);
  }

  static async updateUser(uid: string, fields: any) {
    try {
      const mappedUpdate: any = {};
      if (fields.fullName !== undefined) mappedUpdate.full_name = fields.fullName;
      if (fields.phoneNumber !== undefined) mappedUpdate.phone_number = fields.phoneNumber;
      if (fields.photoURL !== undefined) mappedUpdate.photo_url = fields.photoURL;
      if (fields.email !== undefined) mappedUpdate.email = fields.email;
      if (fields.bio !== undefined) mappedUpdate.bio = fields.bio;
      if (fields.statusMessage !== undefined) mappedUpdate.status_message = fields.statusMessage;
      mappedUpdate.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from('users').update(mappedUpdate).eq('firebase_uid', uid).select();
      if (!error && data && data.length > 0) {
        return mapUserRecord(data[0]);
      }
    } catch (err) {
      logger.error("Error updating user profile:", err);
    }
    return null;
  }

  static async updateOnlineStatus(uid: string, isOnline: boolean) {
    try {
      await supabase.from('users').update({
        is_online: isOnline,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('firebase_uid', uid);
    } catch (err) {
      logger.error("Error updating online status:", err);
    }
  }

  static async getAllUsers() {
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (!error && data) {
        return data.map(mapUserRecord);
      }
    } catch (err) {
      logger.error("Error fetching all users:", err);
    }
    return [];
  }
}
