-- =======================================================
-- PRODUCTION-READY SQL MIGRATION FOR MISSING TABLES
-- =======================================================

-- Ensure uuid extension is loaded
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CHAT MEMBERS TABLE (Group chat or room memberships)
CREATE TABLE IF NOT EXISTS chat_members (
    chat_id VARCHAR(128) NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'member', 'admin'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat ON chat_members(chat_id);

-- 2. CHAT MEDIA TABLE (Shared images, audio, video files in chats)
CREATE TABLE IF NOT EXISTS chat_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id VARCHAR(128) REFERENCES chats(id) ON DELETE CASCADE,
    message_id VARCHAR(128) REFERENCES messages(id) ON DELETE CASCADE,
    sender_id VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE CASCADE,
    media_type VARCHAR(50) NOT NULL, -- 'image', 'video', 'audio', 'file'
    media_url VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_media_chat ON chat_media(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_media_message ON chat_media(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_media_sender ON chat_media(sender_id);

-- 3. MESSAGE STATUS TABLE (Tracks delivery/read status per recipient for groups/channels)
CREATE TABLE IF NOT EXISTS message_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(128) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'delivered', -- 'delivered', 'read'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_status_message ON message_status(message_id);
CREATE INDEX IF NOT EXISTS idx_message_status_user ON message_status(user_id);

-- 4. BLOCKED USERS TABLE (User blocks)
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    blocked_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);


-- =======================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =======================================================

-- Enable RLS on all missing & newly defined tables
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- A. FRIEND REQUESTS POLICIES
CREATE POLICY "Users can view their own friend requests" ON friend_requests
    FOR SELECT USING (sender_id = auth.uid()::text OR receiver_id = auth.uid()::text);

CREATE POLICY "Users can insert friend requests as sender" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid()::text);

CREATE POLICY "Users can update/accept friend requests received" ON friend_requests
    FOR UPDATE USING (receiver_id = auth.uid()::text);

CREATE POLICY "Users can delete their involved friend requests" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid()::text OR receiver_id = auth.uid()::text);

-- B. FRIENDS POLICIES
CREATE POLICY "Users can view friendships they are part of" ON friends
    FOR SELECT USING (user_id = auth.uid()::text OR friend_id = auth.uid()::text);

CREATE POLICY "Users can insert friendships they are part of" ON friends
    FOR INSERT WITH CHECK (user_id = auth.uid()::text OR friend_id = auth.uid()::text);

CREATE POLICY "Users can delete friendships they are part of" ON friends
    FOR DELETE USING (user_id = auth.uid()::text OR friend_id = auth.uid()::text);

-- C. NOTIFICATIONS POLICIES
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "System can insert notifications" ON notifications
    FOR INSERT WITH CHECK (true);

-- D. CHAT MEMBERS POLICIES
CREATE POLICY "Users can view members of chats they are in" ON chat_members
    FOR SELECT USING (
        user_id = auth.uid()::text OR 
        chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid()::text)
    );

CREATE POLICY "Users can join or add members" ON chat_members
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can leave or remove members" ON chat_members
    FOR DELETE USING (user_id = auth.uid()::text);

-- E. CHAT MEDIA POLICIES
CREATE POLICY "Users can view media shared in their chats" ON chat_media
    FOR SELECT USING (
        chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid()::text)
    );

CREATE POLICY "Users can upload media to their chats" ON chat_media
    FOR INSERT WITH CHECK (sender_id = auth.uid()::text);

-- F. MESSAGE STATUS POLICIES
CREATE POLICY "Users can view status of their messages" ON message_status
    FOR SELECT USING (
        user_id = auth.uid()::text OR
        message_id IN (SELECT id FROM messages WHERE sender_id = auth.uid()::text)
    );

CREATE POLICY "Users can update delivery/read status of received messages" ON message_status
    FOR ALL USING (user_id = auth.uid()::text);

-- G. BLOCKED USERS POLICIES
CREATE POLICY "Users can view their block list" ON blocked_users
    FOR SELECT USING (blocker_id = auth.uid()::text);

CREATE POLICY "Users can block other users" ON blocked_users
    FOR INSERT WITH CHECK (blocker_id = auth.uid()::text);

CREATE POLICY "Users can unblock users" ON blocked_users
    FOR DELETE USING (blocker_id = auth.uid()::text);


-- =======================================================
-- REALTIME REPLICATION CONFIGURATION
-- =======================================================
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END
  $$;

  -- Add newly created tables to the supabase_realtime publication
  -- Safe publish helper (avoid throwing error if table already published)
  DO $$
  BEGIN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE friends;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_media;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE message_status;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE blocked_users;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END
  $$;
COMMIT;
