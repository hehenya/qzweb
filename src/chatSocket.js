import { io } from 'socket.io-client';
import { WS_URL } from './api/api.js';

// 对应安卓端 ChatSocketManager(WebSocketManager.kt):第二条 socket.io 连接,
// URL 带 ?type=2 与社区 socket 区分,广播私聊/群聊事件。
//   emit authenticate {token};每 30s emit heartbeat {}
//   监听 auth_success/auth_error、private_message {type, data:Message}、
//        group_message {type, data:Message},type ∈ new/edit/recall
// 采用模块级单例:Sidebar(会话列表)和 ChatView(气泡)共用同一条连接。

let socket = null;
let currentToken = null;
const observers = new Set();

function notify(type, chatId, chatType, message) {
    for (const cb of observers) {
        try { cb(type, chatId, chatType, message); } catch (err) { console.error(err); }
    }
}

export function subscribeChatEvents(callback) {
    observers.add(callback);
    return () => observers.delete(callback);
}

export function isChatSocketConnected() {
    return Boolean(socket?.connected);
}

export function ensureChatSocket(token) {
    if (!token) return;
    if (socket && socket.connected && currentToken === token) return;

    if (socket && currentToken !== token) {
        socket.disconnect();
        socket = null;
    }
    currentToken = token;

    socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 5000,
        // 安卓端 IO.socket("${wsUrl}?type=2"):type=2 标识聊天客户端
        query: { type: '2' },
    });

    socket.on('connect', () => {
        socket.emit('authenticate', { token });
    });
    // 服务端不要求心跳载荷,安卓端发空对象
    const heartbeat = setInterval(() => {
        if (socket?.connected) socket.emit('heartbeat', {});
    }, 30000);
    socket.on('disconnect', () => clearInterval(heartbeat));

    socket.on('private_message', (payload) => {
        const data = payload?.data;
        if (data) notify(payload.type, String(data.chat_id ?? ''), Number(data.chat_type ?? 0), data);
    });
    socket.on('group_message', (payload) => {
        const data = payload?.data;
        if (data) notify(payload.type, String(data.chat_id ?? ''), Number(data.chat_type ?? 0), data);
    });
}

export function disconnectChatSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        currentToken = null;
    }
}
