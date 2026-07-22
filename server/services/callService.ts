import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export class CallService {
  static async saveCall(callObj: any) {
    const callRecord = {
      id: callObj.id,
      caller_id: callObj.callerId,
      receiver_id: callObj.receiverId,
      type: callObj.type || 'video',
      status: callObj.status || 'calling',
      duration_seconds: callObj.durationSeconds || 0,
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('calls').upsert(callRecord);
    } catch (err) {
      logger.error("Error saving call to Supabase:", err);
    }
  }

  static async updateCall(callId: string, status: string, durationSeconds?: number) {
    try {
      const updateData: any = { status };
      if (durationSeconds !== undefined) {
        updateData.duration_seconds = durationSeconds;
      }
      await supabase.from('calls').update(updateData).eq('id', callId);
    } catch (err) {
      logger.error("Error updating call in Supabase:", err);
    }
  }

  static async fetchActiveCall(uid: string) {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .or(`caller_id.eq.${uid},receiver_id.eq.${uid}`)
        .in('status', ['calling', 'ringing', 'connected'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          callerId: data.caller_id,
          receiverId: data.receiver_id,
          type: data.type,
          status: data.status,
          durationSeconds: data.duration_seconds || 0,
          isIncoming: data.receiver_id === uid
        };
      }
    } catch (err) {
      logger.error("Error fetching active call:", err);
    }
    return null;
  }
}
