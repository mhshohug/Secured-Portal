-- =======================================================
-- SUPABASE POSTGRESQL SCHEMA FOR MESSAGING AND CALLING APP
-- =======================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS / PROFILES TABLE
CREATE TABLE IF NOT EXISTS users (
    firebase_uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    email VARCHAR(255) NOT NULL UNIQUE,
    photo_url VARCHAR(1000),
    bio TEXT DEFAULT 'Hey there! I am using this secure chat.',
    status_message VARCHAR(255) DEFAULT 'Available',
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- 2. CHATS TABLE (Optional grouping of messages)
CREATE TABLE IF NOT EXISTS chats (
    id VARCHAR(128) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(128) PRIMARY KEY,
    sender_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    receiver_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'text', -- text, image, audio, video, file
    status VARCHAR(50) DEFAULT 'sent', -- sent, delivered, read
    media_url VARCHAR(1000),
    duration VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_msg_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_msg_timestamp ON messages(timestamp);

-- 4. CALLS TABLE
CREATE TABLE IF NOT EXISTS calls (
    id VARCHAR(128) PRIMARY KEY,
    caller_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    receiver_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    type VARCHAR(50) DEFAULT 'video', -- audio, video
    status VARCHAR(50) DEFAULT 'calling', -- calling, ringing, connected, ended
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calls_participants ON calls(caller_id, receiver_id);

-- 5. FRIENDS TABLE
CREATE TABLE IF NOT EXISTS friends (
    user_id VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE CASCADE,
    friend_id VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, friend_id)
);

-- 6. FRIEND REQUESTS TABLE
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE CASCADE,
    receiver_id VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, declined
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sender_id, receiver_id)
);

-- 7. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- message, call, friend_request
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. TRIGGER FOR UPDATING updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at
    BEFORE UPDATE ON calls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
