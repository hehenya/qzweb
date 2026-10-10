import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from '../api/api.js';

// 与安卓端 CommunitySocket.kt 相同的 socket.io 实时协议:
//   连接后 emit authenticate {token} → join_category {category_id, x-access-token}
//   每 30s emit heartbeat {client_time}(毫秒字符串);切换分区先 leave_category 再 join_category
//   服务端事件: new_message(完整 Message) / message_edited({updated_message})
//              message_deleted({message_id}) / like_update({message_id, like_count})
// 注意:协议里没有"正在输入"事件,安卓端也不做认证成功回执,所以状态直接跟连接走。
export function useCommunitySocket(token, categoryId, { onNewMessage, onMessageEdited, onMessageDeleted, onLikeUpdate }) {
    const [status, setStatus] = useState(token ? 'connecting' : 'disconnected');
    const socketRef = useRef(null);
    const categoryIdRef = useRef(categoryId);

    const callbacksRef = useRef({});
    useEffect(() => {
        callbacksRef.current = { onNewMessage, onMessageEdited, onMessageDeleted, onLikeUpdate };
    });

    useEffect(() => {
        if (!token) return undefined;

        // 安卓端只用 websocket 传输;客户端库自带的自动重连在这里保留
        const socket = io(WS_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 5000,
        });
        socketRef.current = socket;

        const join = (id) => {
            if (socket.connected && id != null) {
                socket.emit('join_category', { category_id: id, 'x-access-token': token });
            }
        };

        let heartbeatTimer = null;
        const startHeartbeat = () => {
            clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
                if (socket.connected) {
                    socket.emit('heartbeat', { client_time: String(Date.now()) });
                }
            }, 30000);
        };

        socket.on('connect', () => {
            socket.emit('authenticate', { token });
            startHeartbeat();
            setStatus('connected');
            join(categoryIdRef.current);
        });
        socket.on('disconnect', () => {
            clearInterval(heartbeatTimer);
            setStatus('disconnected');
        });
        socket.on('connect_error', () => setStatus('disconnected'));

        socket.on('new_message', (msg) => callbacksRef.current.onNewMessage?.(msg));
        socket.on('message_edited', (data) => {
            const msg = data?.updated_message;
            if (msg) callbacksRef.current.onMessageEdited?.(msg);
        });
        socket.on('message_deleted', (data) => {
            if (data?.message_id != null) callbacksRef.current.onMessageDeleted?.(data.message_id);
        });
        socket.on('like_update', (data) => {
            if (data?.message_id != null) callbacksRef.current.onLikeUpdate?.(data.message_id, data.like_count);
        });

        return () => {
            clearInterval(heartbeatTimer);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token]);

    // 切换分区:与安卓端 switchCategory 一致,leave 旧分区再 join 新分区
    useEffect(() => {
        const socket = socketRef.current;
        const prev = categoryIdRef.current;
        if (socket && socket.connected && prev !== categoryId) {
            if (prev != null) socket.emit('leave_category', { category_id: prev });
            if (categoryId != null) socket.emit('join_category', { category_id: categoryId, 'x-access-token': token });
        }
        categoryIdRef.current = categoryId;
    }, [categoryId, token]);

    return { status };
}
