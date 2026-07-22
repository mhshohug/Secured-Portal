import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { UserService, mapUserRecord } from './userService';

export class FriendService {
  static async checkAreFriends(uid1: string, uid2: string): Promise<boolean> {
    if (!uid1 || !uid2) return false;
    if (uid1 === uid2) return true;

    try {
      const { data: friendData } = await supabase
        .from('friends')
        .select('*')
        .or(`and(user_id.eq.${uid1},friend_id.eq.${uid2}),and(user_id.eq.${uid2},friend_id.eq.${uid1})`)
        .maybeSingle();

      if (friendData) return true;

      const { data: reqData } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`and(sender_id.eq.${uid1},receiver_id.eq.${uid2}),and(sender_id.eq.${uid2},receiver_id.eq.${uid1})`)
        .eq('status', 'accepted')
        .maybeSingle();

      if (reqData) return true;
    } catch (err) {
      logger.error("Error checking friendship:", err);
    }
    return false;
  }

  static async fetchFriendsForUser(currentUid: string) {
    if (!currentUid) return [];
    const friendUids = new Set<string>();

    try {
      const { data: fData } = await supabase
        .from('friends')
        .select('*')
        .or(`user_id.eq.${currentUid},friend_id.eq.${currentUid}`);

      if (fData) {
        fData.forEach((row: any) => {
          const friendId = row.user_id === currentUid ? row.friend_id : row.user_id;
          if (friendId && friendId !== currentUid) friendUids.add(friendId);
        });
      }

      const { data: reqData } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`sender_id.eq.${currentUid},receiver_id.eq.${currentUid}`)
        .eq('status', 'accepted');

      if (reqData) {
        reqData.forEach((row: any) => {
          const friendId = row.sender_id === currentUid ? row.receiver_id : row.sender_id;
          if (friendId && friendId !== currentUid) friendUids.add(friendId);
        });
      }
    } catch (err) {
      logger.error("Error fetching friends list:", err);
    }

    const friendsList = [];
    for (const fUid of Array.from(friendUids)) {
      const friendObj = await UserService.getUser(fUid);
      if (friendObj) friendsList.push(friendObj);
    }
    return friendsList;
  }

  static async searchUsers(currentUid: string, queryStr: string) {
    const cleanQ = (queryStr || '').trim().toLowerCase();
    if (!cleanQ) return [];
    const digits = cleanQ.replace(/\D/g, '');

    let matchedUsers: any[] = [];
    try {
      let q = supabase.from('users').select('*');
      if (digits.length >= 3) {
        q = q.or(`full_name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%,phone_number.ilike.%${cleanQ}%,phone_number.ilike.%${digits}%`);
      } else {
        q = q.or(`full_name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%,phone_number.ilike.%${cleanQ}%`);
      }
      const { data, error } = await q;
      if (!error && data && data.length > 0) {
        matchedUsers = data;
      } else {
        const { data: allData, error: allErr } = await supabase.from('users').select('*');
        if (!allErr && allData) {
          matchedUsers = allData.filter((u: any) => {
            const fullName = (u.full_name || u.name || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const phone = (u.phone_number || u.phone || '').toLowerCase();
            const phoneDigits = phone.replace(/\D/g, '');
            return (
              fullName.includes(cleanQ) ||
              email.includes(cleanQ) ||
              phone.includes(cleanQ) ||
              (digits.length >= 3 && phoneDigits.includes(digits))
            );
          });
        }
      }
    } catch (err) {
      logger.error("Error searching users:", err);
    }

    let friendsList: string[] = [];
    let reqs: any[] = [];
    try {
      const { data: fData } = await supabase.from('friends').select('*').or(`user_id.eq.${currentUid},friend_id.eq.${currentUid}`);
      if (fData) friendsList = fData.map((f: any) => f.user_id === currentUid ? f.friend_id : f.user_id);
      const { data: rData } = await supabase.from('friend_requests').select('*').or(`sender_id.eq.${currentUid},receiver_id.eq.${currentUid}`);
      if (rData) reqs = rData;
    } catch (err) {
      logger.error("Error fetching relations during search:", err);
    }

    matchedUsers = matchedUsers.filter((u: any) => {
      const uid = u.firebase_uid || u.id || u.uid;
      return uid && uid !== currentUid;
    });

    return matchedUsers.map((u: any) => {
      const userObj = mapUserRecord(u);
      const otherUid = u.firebase_uid || u.id || u.uid;

      if (friendsList.includes(otherUid)) {
        return { ...userObj, relationship: 'friend' };
      }

      const pendingReq = reqs.find((r: any) => 
        (r.sender_id === currentUid && r.receiver_id === otherUid && r.status === 'pending') ||
        (r.sender_id === otherUid && r.receiver_id === currentUid && r.status === 'pending')
      );

      if (pendingReq) {
        if (pendingReq.sender_id === currentUid) {
          return { ...userObj, relationship: 'sent_pending', requestId: pendingReq.id };
        } else {
          return { ...userObj, relationship: 'received_pending', requestId: pendingReq.id };
        }
      }

      return { ...userObj, relationship: 'none' };
    });
  }

  static async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new Error("Cannot send friend request to yourself.");

    let existingReq: any = null;
    try {
      const { data } = await supabase.from('friend_requests')
        .select('*')
        .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
        .maybeSingle();
      if (data) existingReq = data;
    } catch (err) {
      logger.error("Error checking existing friend request:", err);
    }

    if (existingReq) {
      if (existingReq.status === 'accepted') return { status: 'already_friends', request: existingReq };
      if (existingReq.sender_id === senderId && existingReq.status === 'pending') return { status: 'sent_pending', request: existingReq };
      if (existingReq.sender_id === receiverId && existingReq.status === 'pending') {
        return await this.acceptFriendRequest(senderId, existingReq.id);
      }
    }

    const reqId = `fr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();

    const newRequest = {
      id: reqId,
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      created_at: nowIso
    };

    try {
      const { data, error } = await supabase.from('friend_requests').insert(newRequest).select();
      if (!error && data && data.length > 0) {
        newRequest.id = data[0].id;
      }
    } catch (err) {
      logger.error("Error inserting friend request:", err);
    }

    const senderUser = await UserService.getUser(senderId);
    const receiverUser = await UserService.getUser(receiverId);

    return {
      status: 'success',
      request: {
        id: newRequest.id,
        senderId,
        receiverId,
        status: 'pending',
        createdAt: nowIso,
        sender: senderUser,
        receiver: receiverUser
      }
    };
  }

  static async acceptFriendRequest(currentUid: string, requestIdOrSenderId: string) {
    let reqRecord: any = null;
    try {
      const { data } = await supabase.from('friend_requests')
        .select('*')
        .or(`id.eq.${requestIdOrSenderId},and(sender_id.eq.${requestIdOrSenderId},receiver_id.eq.${currentUid})`)
        .maybeSingle();
      if (data) reqRecord = data;
    } catch (err) {
      logger.error("Error fetching request to accept:", err);
    }

    if (!reqRecord) throw new Error("Friend request not found.");

    const senderId = reqRecord.sender_id;
    const receiverId = reqRecord.receiver_id;

    try {
      await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', reqRecord.id);
      await supabase.from('friends').upsert([
        { user_id: senderId, friend_id: receiverId },
        { user_id: receiverId, friend_id: senderId }
      ]);
    } catch (err) {
      logger.error("Error accepting friend request:", err);
    }

    const senderUser = await UserService.getUser(senderId);
    const receiverUser = await UserService.getUser(receiverId);

    return {
      status: 'success',
      senderId,
      receiverId,
      senderUser,
      receiverUser,
      requestId: reqRecord.id
    };
  }

  static async declineFriendRequest(currentUid: string, requestIdOrSenderId: string) {
    try {
      await supabase.from('friend_requests').delete().or(`id.eq.${requestIdOrSenderId},and(sender_id.eq.${requestIdOrSenderId},receiver_id.eq.${currentUid})`);
    } catch (err) {
      logger.error("Error declining friend request:", err);
    }
    return { status: 'success', requestId: requestIdOrSenderId };
  }

  static async cancelFriendRequest(currentUid: string, requestIdOrReceiverId: string) {
    try {
      await supabase.from('friend_requests').delete().or(`id.eq.${requestIdOrReceiverId},and(sender_id.eq.${currentUid},receiver_id.eq.${requestIdOrReceiverId})`);
    } catch (err) {
      logger.error("Error cancelling friend request:", err);
    }
    return { status: 'success', requestId: requestIdOrReceiverId };
  }

  static async getFriendRequests(currentUid: string) {
    let incoming: any[] = [];
    let outgoing: any[] = [];
    try {
      const { data: incData } = await supabase.from('friend_requests').select('*').eq('receiver_id', currentUid).eq('status', 'pending');
      if (incData) incoming = incData;

      const { data: outData } = await supabase.from('friend_requests').select('*').eq('sender_id', currentUid).eq('status', 'pending');
      if (outData) outgoing = outData;
    } catch (err) {
      logger.error("Error fetching friend requests:", err);
    }

    const incomingRequests = [];
    for (const req of incoming) {
      const sender = await UserService.getUser(req.sender_id);
      incomingRequests.push({
        id: req.id,
        senderId: req.sender_id,
        receiverId: req.receiver_id,
        status: req.status,
        createdAt: req.created_at,
        sender
      });
    }

    const outgoingRequests = [];
    for (const req of outgoing) {
      const receiver = await UserService.getUser(req.receiver_id);
      outgoingRequests.push({
        id: req.id,
        senderId: req.sender_id,
        receiverId: req.receiver_id,
        status: req.status,
        createdAt: req.created_at,
        receiver
      });
    }

    return { incomingRequests, outgoingRequests };
  }

  static async syncContacts(currentUid: string, contacts: any[]) {
    const synced = [];
    for (const c of contacts || []) {
      const phone = c.phone || c.phoneNumber;
      const email = c.email;
      const name = c.name || c.fullName;
      if (!phone && !email) continue;

      try {
        let q = supabase.from('users').select('*');
        if (phone && email) {
          q = q.or(`phone_number.eq.${phone},email.eq.${email}`);
        } else if (phone) {
          q = q.eq('phone_number', phone);
        } else if (email) {
          q = q.eq('email', email);
        }
        const { data } = await q.maybeSingle();
        if (data && data.firebase_uid !== currentUid) {
          synced.push({ ...mapUserRecord(data), contactName: name });
        }
      } catch (err) {
        logger.error("Error syncing contact:", err);
      }
    }
    return synced;
  }
}
