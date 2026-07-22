import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export const mapMessageRecord = (row: any): any => {
  if (!row) return null;
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    type: row.type || 'text',
    timestamp: typeof row.timestamp === 'string' 
      ? row.timestamp 
      : new Date(row.timestamp).toISOString(),
    status: row.status || 'sent',
    mediaUrl: row.media_url || '',
    fileName: row.file_name || '',
    fileSize: row.file_size || '',
    duration: row.duration || '',
    replyTo: (row.reply_to_id || row.reply_to_content) ? {
      id: row.reply_to_id || '',
      content: row.reply_to_content || '',
      senderName: row.reply_to_sender_name || '',
      type: row.reply_to_type || 'text'
    } : undefined,
    isEdited: row.is_edited || false,
    editedAt: row.edited_at || undefined,
    deletedFor: Array.isArray(row.deleted_for) ? row.deleted_for : [],
    isDeletedForEveryone: row.is_deleted_for_everyone || false
  };
};

export class MessageService {
  static async ensureChatExists(uid1: string, uid2: string) {
    const chatId = [uid1, uid2].sort().join('_');
    const nowIso = new Date().toISOString();
    try {
      const { data } = await supabase.from('chats').select('*').eq('id', chatId).maybeSingle();
      if (!data) {
        await supabase.from('chats').insert({
          id: chatId,
          user1_id: uid1 < uid2 ? uid1 : uid2,
          user2_id: uid1 < uid2 ? uid2 : uid1,
          created_at: nowIso,
          updated_at: nowIso
        });
      } else {
        await supabase.from('chats').update({ updated_at: nowIso }).eq('id', chatId);
      }
    } catch (err) {
      // chats table optional schema
    }
    return chatId;
  }

  static async saveMessage(msg: any) {
    const messageRecord = {
      id: msg.id,
      sender_id: msg.senderId,
      receiver_id: msg.receiverId,
      content: msg.content || '',
      type: msg.type || 'text',
      timestamp: msg.timestamp || new Date().toISOString(),
      status: msg.status || 'sent',
      media_url: msg.mediaUrl || null,
      file_name: msg.fileName || null,
      file_size: msg.fileSize || null,
      duration: msg.duration || null,
      reply_to_id: msg.replyTo?.id || null,
      reply_to_content: msg.replyTo?.content || null,
      reply_to_sender_name: msg.replyTo?.senderName || null,
      reply_to_type: msg.replyTo?.type || null,
      is_edited: msg.isEdited || false,
      edited_at: msg.editedAt || null,
      deleted_for: msg.deletedFor || [],
      is_deleted_for_everyone: msg.isDeletedForEveryone || false
    };

    try {
      await supabase.from('messages').upsert(messageRecord);
      await this.ensureChatExists(msg.senderId, msg.receiverId);
    } catch (err) {
      logger.error("Error saving message to Supabase:", err);
      throw err;
    }
  }

  static async fetchMessagesBetween(uid1: string, uid2: string) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${uid1},receiver_id.eq.${uid2}),and(sender_id.eq.${uid2},receiver_id.eq.${uid1})`)
        .order('timestamp', { ascending: true });

      if (!error && data) {
        return data.map(mapMessageRecord).filter((m: any) => !m.deletedFor?.includes(uid1));
      }
    } catch (err) {
      logger.error("Error fetching messages:", err);
    }
    return [];
  }

  static async updateMessageStatus(msgId: string, status: string) {
    try {
      await supabase.from('messages').update({ status }).eq('id', msgId);
    } catch (err) {
      logger.error("Error updating message status:", err);
    }
  }

  static async editMessage(msgId: string, newContent: string) {
    const nowIso = new Date().toISOString();
    try {
      await supabase.from('messages').update({
        content: newContent,
        is_edited: true,
        edited_at: nowIso
      }).eq('id', msgId);
    } catch (err) {
      logger.error("Error editing message:", err);
    }
    return { msgId, newContent, isEdited: true, editedAt: nowIso };
  }

  static async deleteMessageForMe(msgId: string, userId: string) {
    try {
      const { data } = await supabase.from('messages').select('deleted_for').eq('id', msgId).maybeSingle();
      const currentArr = Array.isArray(data?.deleted_for) ? data.deleted_for : [];
      if (!currentArr.includes(userId)) {
        currentArr.push(userId);
        await supabase.from('messages').update({ deleted_for: currentArr }).eq('id', msgId);
      }
    } catch (err) {
      logger.error("Error deleting message for me:", err);
    }
    return { msgId, userId };
  }

  static async deleteMessageForEveryone(msgId: string) {
    try {
      await supabase.from('messages').update({
        content: 'This message was deleted',
        is_deleted_for_everyone: true
      }).eq('id', msgId);
    } catch (err) {
      logger.error("Error deleting message for everyone:", err);
    }
    return { msgId };
  }

  static async markMessagesRead(senderId: string, receiverId: string) {
    try {
      await supabase.from('messages')
        .update({ status: 'read' })
        .eq('sender_id', senderId)
        .eq('receiver_id', receiverId)
        .neq('status', 'read');
    } catch (err) {
      logger.error("Error marking messages read:", err);
    }
  }
}
