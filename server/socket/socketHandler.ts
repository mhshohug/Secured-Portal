import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { UserService } from '../services/userService';
import { MessageService } from '../services/messageService';
import { CallService } from '../services/callService';
import { FriendService } from '../services/friendService';

const userSocketMap = new Map<string, string>(); // userId -> socketId
const socketUserMap = new Map<string, string>(); // socketId -> userId

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Auth & Room Registration
    socket.on('auth', async ({ userId }) => {
      if (!userId) return;
      userSocketMap.set(userId, socket.id);
      socketUserMap.set(socket.id, userId);
      socket.join(userId);

      await UserService.updateOnlineStatus(userId, true);
      io.emit('user_online_status', { userId, isOnline: true });
      logger.info(`User authenticated on socket: ${userId} (${socket.id})`);
    });

    // Typing Indicator
    socket.on('typing', ({ receiverId, isTyping }) => {
      const senderId = socketUserMap.get(socket.id);
      if (!senderId || !receiverId) return;
      io.to(receiverId).emit('typing', { senderId, isTyping });
    });

    // Send Message Realtime Delivery & Persistence
    socket.on('send_message', async (msg: any, callback?: Function) => {
      try {
        if (!msg || !msg.senderId || !msg.receiverId) {
          if (callback) callback({ status: 'error', error: 'Invalid message payload' });
          return;
        }

        // Save via MessageService (single source of truth)
        await MessageService.saveMessage(msg);

        // Broadcast to receiver
        io.to(msg.receiverId).emit('receive_message', msg);

        if (callback) callback({ status: 'success', messageId: msg.id });

        // Simulate delivery & read after broadcast
        setTimeout(async () => {
          await MessageService.updateMessageStatus(msg.id, 'delivered');
          io.to(msg.senderId).emit('message_status_update', { messageId: msg.id, status: 'delivered' });
        }, 1000);

        setTimeout(async () => {
          await MessageService.updateMessageStatus(msg.id, 'read');
          io.to(msg.senderId).emit('message_status_update', { messageId: msg.id, status: 'read' });
          if (msg.receiverId) {
            await MessageService.markMessagesRead(msg.receiverId, msg.senderId);
            io.to(msg.receiverId).emit('messages_read', { readerId: msg.senderId });
          }
        }, 2500);

      } catch (err: any) {
        logger.error("Error in send_message socket handler:", err);
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

    // Message Editing
    socket.on('edit_message', async ({ messageId, newContent, receiverId }) => {
      try {
        const result = await MessageService.editMessage(messageId, newContent);
        if (receiverId) {
          io.to(receiverId).emit('message_edited', { messageId, ...result });
        }
        const senderId = socketUserMap.get(socket.id);
        if (senderId) {
          io.to(senderId).emit('message_edited', { messageId, ...result });
        }
      } catch (err) {
        logger.error("Error in edit_message socket handler:", err);
      }
    });

    // Message Deletion For Me
    socket.on('delete_message_for_me', async ({ messageId }) => {
      const userId = socketUserMap.get(socket.id);
      if (!userId) return;
      await MessageService.deleteMessageForMe(messageId, userId);
    });

    // Message Deletion For Everyone
    socket.on('delete_message_for_everyone', async ({ messageId, receiverId }) => {
      await MessageService.deleteMessageForEveryone(messageId);
      if (receiverId) {
        io.to(receiverId).emit('message_deleted', { messageId });
      }
      const senderId = socketUserMap.get(socket.id);
      if (senderId) {
        io.to(senderId).emit('message_deleted', { messageId });
      }
    });

    // Mark Messages Read
    socket.on('mark_messages_read', async ({ senderId }) => {
      const receiverId = socketUserMap.get(socket.id);
      if (!receiverId || !senderId) return;
      await MessageService.markMessagesRead(senderId, receiverId);
      io.to(senderId).emit('messages_read', { readerId: receiverId });
    });

    // Friend Requests Realtime
    socket.on('send_friend_request', async ({ receiverId }, callback) => {
      const senderId = socketUserMap.get(socket.id);
      if (!senderId || !receiverId) return;
      try {
        const result = await FriendService.sendFriendRequest(senderId, receiverId);
        io.to(receiverId).emit('friend_request_received', (result as any).request);
        if (callback) callback(result);
      } catch (err: any) {
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

    socket.on('accept_friend_request', async ({ requestId, senderId }, callback) => {
      const currentUid = socketUserMap.get(socket.id);
      if (!currentUid) return;
      try {
        const result = await FriendService.acceptFriendRequest(currentUid, requestId || senderId);
        if (result.senderId) io.to(result.senderId).emit('friend_request_accepted', result);
        if (result.receiverId) io.to(result.receiverId).emit('friend_request_accepted', result);
        if (callback) callback(result);
      } catch (err: any) {
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

    // WebRTC Calling & Signaling
    socket.on('initiate_call', async (callData) => {
      const callerId = socketUserMap.get(socket.id) || callData.callerId;
      const receiverId = callData.receiverId;
      if (!receiverId) return;

      const callRecord = {
        id: callData.id || `call_${Date.now()}`,
        callerId,
        receiverId,
        type: callData.type || 'video',
        status: 'calling',
        durationSeconds: 0
      };

      await CallService.saveCall(callRecord);

      io.to(receiverId).emit('incoming_call', {
        ...callRecord,
        isIncoming: true,
        caller: await UserService.getUser(callerId)
      });
    });

    socket.on('update_call', async (updateData) => {
      const { callId, status, durationSeconds } = updateData;
      if (!callId) return;
      await CallService.updateCall(callId, status, durationSeconds);

      // Broadcast to call participants if any
      const senderId = socketUserMap.get(socket.id);
      if (senderId) {
        socket.broadcast.emit('call_status_update', { callId, status, durationSeconds });
        socket.emit('call_status_update', { callId, status, durationSeconds });
      }
    });

    socket.on('accept_call', ({ callId, receiverId }) => {
      if (receiverId) {
        io.to(receiverId).emit('call_status_update', { callId, status: 'connected' });
      }
    });

    socket.on('reject_call', ({ callId, receiverId }) => {
      CallService.updateCall(callId, 'ended');
      if (receiverId) {
        io.to(receiverId).emit('call_status_update', { callId, status: 'ended' });
      }
    });

    socket.on('end_call', ({ callId, partnerId }) => {
      CallService.updateCall(callId, 'ended');
      if (partnerId) {
        io.to(partnerId).emit('call_status_update', { callId, status: 'ended' });
      }
      socket.emit('call_status_update', { callId, status: 'ended' });
    });

    // WebRTC P2P Signaling Relays
    socket.on('webrtc_offer', ({ targetUserId, offer }) => {
      io.to(targetUserId).emit('webrtc_offer', { senderId: socketUserMap.get(socket.id), offer });
    });

    socket.on('webrtc_answer', ({ targetUserId, answer }) => {
      io.to(targetUserId).emit('webrtc_answer', { senderId: socketUserMap.get(socket.id), answer });
    });

    socket.on('webrtc_ice_candidate', ({ targetUserId, candidate }) => {
      io.to(targetUserId).emit('webrtc_ice_candidate', { senderId: socketUserMap.get(socket.id), candidate });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      const userId = socketUserMap.get(socket.id);
      if (userId) {
        socketUserMap.delete(socket.id);
        userSocketMap.delete(userId);
        await UserService.updateOnlineStatus(userId, false);
        io.emit('user_online_status', { userId, isOnline: false });
        logger.info(`User disconnected: ${userId}`);
      } else {
        logger.info(`Socket disconnected: ${socket.id}`);
      }
    });
  });
}
