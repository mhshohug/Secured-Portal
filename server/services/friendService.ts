import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { UserService, mapUserRecord } from './userService';

export class FriendService {
  static async checkAreFriends(uid1: string, uid2: string): Promise<boolean> {
    if (!uid1 || !uid2) return false;
    if (uid1 === uid2) return true;

    console.log(`[DATABASE QUERY] checkAreFriends between ${uid1} and ${uid2}`);
    try {
      const { data: friendData } = await supabase
        .from('friends')
        .select('*')
        .or(`and(user_id.eq.${uid1},friend_id.eq.${uid2}),and(user_id.eq.${uid2},friend_id.eq.${uid1})`)
        .maybeSingle();

      if (friendData) {
        console.log(`[STATE CHANGE] checkAreFriends found friendship in 'friends' table:`, friendData);
        return true;
      }
    } catch (err) {
      logger.error("Error checking friendship:", err);
    }
    return false;
  }

  static async fetchFriendsForUser(currentUid: string) {
    if (!currentUid) return [];
    console.log(`[DATABASE QUERY] fetchFriendsForUser (Friend List) for UID: ${currentUid}`);
    const friendUids = new Set<string>();

    try {
      // Load friends ONLY from the friends table
      const { data: fData, error } = await supabase
        .from('friends')
        .select('*')
        .eq('user_id', currentUid);

      if (error) {
        console.error('[DATABASE ERROR] fetchFriendsForUser from friends table error:', error);
      }

      if (fData) {
        console.log(`[DATABASE QUERY RESULT] friends rows for currentUid ${currentUid}:`, fData);
        fData.forEach((row: any) => {
          if (row.friend_id && row.friend_id !== currentUid) {
            friendUids.add(row.friend_id);
          }
        });
      }
    } catch (err) {
      logger.error("Error fetching friends list:", err);
    }

    const friendsList = [];
    for (const fUid of Array.from(friendUids)) {
      console.log(`[DATABASE QUERY] Fetching user profile to join for friend UID: ${fUid}`);
      const friendObj = await UserService.getUser(fUid);
      if (friendObj) {
        friendsList.push(friendObj);
      }
    }

    console.log(`[STATE CHANGE] fetchFriendsForUser completed. Returned ${friendsList.length} friends for UID ${currentUid}`);
    return friendsList;
  }

  static async searchUsers(currentUid: string, queryStr: string) {
    const cleanQ = (queryStr || '').trim().toLowerCase();
    if (!cleanQ) return [];
    const digits = cleanQ.replace(/\D/g, '');

    console.log(`[DATABASE QUERY] searchUsers initiated by UID: ${currentUid} with query: "${cleanQ}"`);

    let matchedUsers: any[] = [];
    try {
      // Search directly from users table
      const { data: allData, error: allErr } = await supabase.from('users').select('*');
      if (allErr) {
        console.error('[DATABASE ERROR] searchUsers query error:', allErr);
      }

      if (allData) {
        console.log(`[DATABASE QUERY RESULT] fetched ${allData.length} registered users to match search term`);
        matchedUsers = allData.filter((u: any) => {
          const fullName = (u.full_name || u.name || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          const phone = (u.phone_number || u.phone || '').toLowerCase();
          const phoneDigits = phone.replace(/\D/g, '');
          const match = (
            fullName.includes(cleanQ) ||
            email.includes(cleanQ) ||
            phone.includes(cleanQ) ||
            (digits.length >= 3 && phoneDigits.includes(digits))
          );
          return match;
        });
      }
    } catch (err) {
      logger.error("Error searching users:", err);
    }

    let friendsList: string[] = [];
    let reqs: any[] = [];
    try {
      console.log(`[DATABASE QUERY] Fetching relationship states for search mapping. UID: ${currentUid}`);
      const { data: fData } = await supabase.from('friends').select('*').eq('user_id', currentUid);
      if (fData) {
        friendsList = fData.map((f: any) => f.friend_id);
      }

      const { data: rData } = await supabase.from('friend_requests').select('*').or(`sender_id.eq.${currentUid},receiver_id.eq.${currentUid}`);
      if (rData) {
        reqs = rData;
      }
    } catch (err) {
      logger.error("Error fetching relations during search:", err);
    }

    // Exclude currently logged-in user from search results
    matchedUsers = matchedUsers.filter((u: any) => {
      const uid = u.firebase_uid || u.id || u.uid;
      return uid && uid !== currentUid;
    });

    console.log(`[STATE CHANGE] User filtering excluded current user. Matching search results count: ${matchedUsers.length}`);

    return matchedUsers.map((u: any) => {
      const userObj = mapUserRecord(u);
      const otherUid = u.firebase_uid || u.id || u.uid;

      // Determine Button State according to strict priorities:
      // Priority 1: Friends
      // Priority 2: Incoming Pending (received_pending)
      // Priority 3: Outgoing Pending (sent_pending)
      // Priority 4: Add Friend (none)
      if (friendsList.includes(otherUid)) {
        console.log(`[STATE CHANGE] search result state for user ${otherUid}: friend`);
        return { ...userObj, relationship: 'friend' };
      }

      const pendingReq = reqs.find((r: any) => 
        r.status === 'pending' && (
          (r.sender_id === currentUid && r.receiver_id === otherUid) ||
          (r.sender_id === otherUid && r.receiver_id === currentUid)
        )
      );

      if (pendingReq) {
        if (pendingReq.sender_id === currentUid) {
          console.log(`[STATE CHANGE] search result state for user ${otherUid}: sent_pending (Outgoing Pending)`);
          return { ...userObj, relationship: 'sent_pending', requestId: pendingReq.id };
        } else {
          console.log(`[STATE CHANGE] search result state for user ${otherUid}: received_pending (Incoming Pending)`);
          return { ...userObj, relationship: 'received_pending', requestId: pendingReq.id };
        }
      }

      console.log(`[STATE CHANGE] search result state for user ${otherUid}: none (Add Friend)`);
      return { ...userObj, relationship: 'none' };
    });
  }

  static async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new Error("Cannot send friend request to yourself.");

    console.log(`[DATABASE QUERY] sendFriendRequest checking duplicate requests between ${senderId} and ${receiverId}`);
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
      console.log(`[STATE CHANGE] sendFriendRequest found existing request status: ${existingReq.status}`);
      if (existingReq.status === 'accepted') return { status: 'already_friends', request: existingReq };
      if (existingReq.sender_id === senderId && existingReq.status === 'pending') return { status: 'sent_pending', request: existingReq };
      if (existingReq.sender_id === receiverId && existingReq.status === 'pending') {
        return await this.acceptFriendRequest(senderId, existingReq.id);
      }
    }

    // Do NOT specify ID to let Supabase Postgres automatically generate UUID via default schema
    const nowIso = new Date().toISOString();
    const newRequest = {
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      created_at: nowIso
    };

    console.log(`[DATABASE QUERY] Inserting new row into friend_requests (status='pending') without 'friends' modification:`, newRequest);
    try {
      const { data, error } = await supabase.from('friend_requests').insert(newRequest).select();
      if (error) {
        console.error('[DATABASE ERROR] sendFriendRequest insert failed:', error);
        throw error;
      }
      
      const insertedRow = data && data.length > 0 ? data[0] : null;
      const reqId = insertedRow ? insertedRow.id : `fr_${Date.now()}`;
      
      console.log(`[STATE CHANGE] sendFriendRequest successfully stored. ID: ${reqId}`);
      const senderUser = await UserService.getUser(senderId);
      const receiverUser = await UserService.getUser(receiverId);

      return {
        status: 'success',
        request: {
          id: reqId,
          senderId,
          receiverId,
          status: 'pending',
          createdAt: nowIso,
          sender: senderUser,
          receiver: receiverUser
        }
      };
    } catch (err) {
      logger.error("Error inserting friend request:", err);
      throw err;
    }
  }

  static async acceptFriendRequest(currentUid: string, requestIdOrSenderId: string) {
    console.log(`[DATABASE QUERY] acceptFriendRequest currentUid: ${currentUid}, request identifier: ${requestIdOrSenderId}`);
    let reqRecord: any = null;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestIdOrSenderId);
      let query;
      if (isUuid) {
        query = supabase.from('friend_requests').select('*').eq('id', requestIdOrSenderId);
      } else {
        query = supabase.from('friend_requests').select('*')
          .eq('sender_id', requestIdOrSenderId)
          .eq('receiver_id', currentUid);
      }

      const { data } = await query.maybeSingle();
      if (data) reqRecord = data;
    } catch (err) {
      logger.error("Error fetching request to accept:", err);
    }

    if (!reqRecord) throw new Error("Friend request not found.");

    const senderId = reqRecord.sender_id;
    const receiverId = reqRecord.receiver_id;

    console.log(`[DATABASE TRANSACTION] Accepting friend request. IDs involved: Sender ${senderId}, Receiver ${receiverId}`);
    try {
      // Update request status to accepted
      const { error: updateErr } = await supabase.from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', reqRecord.id);
      
      if (updateErr) {
        console.error('[DATABASE ERROR] acceptFriendRequest status update failed:', updateErr);
      } else {
        console.log(`[STATE CHANGE] friend_requests.status updated to 'accepted' for request ID ${reqRecord.id}`);
      }

      // Insert two friendship rows in friends table
      const friendshipRows = [
        { user_id: senderId, friend_id: receiverId },
        { user_id: receiverId, friend_id: senderId }
      ];
      console.log('[DATABASE QUERY] Inserting symmetric friendship rows into friends table:', friendshipRows);
      const { error: insertErr } = await supabase.from('friends').upsert(friendshipRows);
      
      if (insertErr) {
        console.error('[DATABASE ERROR] acceptFriendRequest friends row insertion failed:', insertErr);
      } else {
        console.log('[STATE CHANGE] Symmetric friends records successfully written into friends table');
      }
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
    console.log(`[DATABASE QUERY] declineFriendRequest currentUid: ${currentUid}, request identifier: ${requestIdOrSenderId}`);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestIdOrSenderId);
      let query;
      if (isUuid) {
        query = supabase.from('friend_requests').delete().eq('id', requestIdOrSenderId);
      } else {
        query = supabase.from('friend_requests').delete()
          .eq('sender_id', requestIdOrSenderId)
          .eq('receiver_id', currentUid);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[DATABASE ERROR] declineFriendRequest failed:', error);
      } else {
        console.log('[STATE CHANGE] Friend request declined and deleted successfully from friend_requests');
      }
    } catch (err) {
      logger.error("Error declining friend request:", err);
    }
    return { status: 'success', requestId: requestIdOrSenderId };
  }

  static async cancelFriendRequest(currentUid: string, requestIdOrReceiverId: string) {
    console.log(`[DATABASE QUERY] cancelFriendRequest currentUid: ${currentUid}, request identifier: ${requestIdOrReceiverId}`);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestIdOrReceiverId);
      let query;
      if (isUuid) {
        query = supabase.from('friend_requests').delete().eq('id', requestIdOrReceiverId);
      } else {
        query = supabase.from('friend_requests').delete()
          .eq('sender_id', currentUid)
          .eq('receiver_id', requestIdOrReceiverId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[DATABASE ERROR] cancelFriendRequest failed:', error);
      } else {
        console.log('[STATE CHANGE] Sent friend request cancelled and deleted successfully from friend_requests');
      }
    } catch (err) {
      logger.error("Error cancelling friend request:", err);
    }
    return { status: 'success', requestId: requestIdOrReceiverId };
  }

  static async getFriendRequests(currentUid: string) {
    console.log(`[DATABASE QUERY] getFriendRequests for currentUid: ${currentUid}`);
    let incoming: any[] = [];
    let outgoing: any[] = [];
    try {
      // Query incoming friend_requests where receiver_id=currentUid and status='pending'
      const { data: incData, error: incErr } = await supabase.from('friend_requests')
        .select('*')
        .eq('receiver_id', currentUid)
        .eq('status', 'pending');
      if (incErr) console.error('[DATABASE ERROR] getFriendRequests incoming query error:', incErr);
      if (incData) incoming = incData;

      // Query outgoing friend_requests where sender_id=currentUid and status='pending'
      const { data: outData, error: outErr } = await supabase.from('friend_requests')
        .select('*')
        .eq('sender_id', currentUid)
        .eq('status', 'pending');
      if (outErr) console.error('[DATABASE ERROR] getFriendRequests outgoing query error:', outErr);
      if (outData) outgoing = outData;
    } catch (err) {
      logger.error("Error fetching friend requests:", err);
    }

    const incomingRequests = [];
    for (const req of incoming) {
      console.log(`[DATABASE QUERY] Fetching sender profile to join for request: ${req.id}`);
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
      console.log(`[DATABASE QUERY] Fetching receiver profile to join for request: ${req.id}`);
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

    console.log(`[STATE CHANGE] getFriendRequests returned ${incomingRequests.length} incoming, ${outgoingRequests.length} outgoing requests`);
    return { incomingRequests, outgoingRequests };
  }

  static async syncContacts(currentUid: string, contacts: any[]) {
    console.log(`[DATABASE QUERY] syncContacts for currentUid: ${currentUid}, contacts count: ${contacts?.length || 0}`);
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
    console.log(`[STATE CHANGE] syncContacts matched ${synced.length} registered contacts`);
    return synced;
  }
}
