// 私聊/群聊 API,对应安卓端 message/ 包:
//   - MessageDetailViewModel.kt  chat/messages、chat/send、group/detail、撤回、编辑
//   - MessageModels.kt           GetMessagesResponse / SendMessageRequest / Message(会话版)

import { request, ApiError } from './api.js';

// chat_type: 1=私聊 2=群聊(与安卓端一致)

// GetMessagesResponse: { status:{number,code,msg}, messages:[Message], can_send,
//   pagination:{page,per_page,total,pages}, other_user, chat_background_url,
//   is_friend, relationship, temp_chat_expired, is_admin }
export async function getChatMessages(token, chatType, chatId, page = 1, perPage = 20) {
    const data = await request('/chat/messages', {
        method: 'POST', token, json: { chat_type: chatType, chat_id: chatId, page, per_page: perPage },
    });
    if (data?.status?.code !== 0) {
        throw new ApiError(data?.status?.msg || '加载消息失败', 200);
    }
    return data;
}

// SendMessageRequest: { chat_type, chat_id, data:{text, images, is_markdown}, quote_msg_id? }
// 成功时 status.code === 0,返回服务端回显的 msg(Message,可能为 null)
export async function sendChatMessage(token, chatType, chatId, { text = '', images = [], isMarkdown = false, quoteMsgId } = {}) {
    const data = await request('/chat/send', {
        method: 'POST',
        token,
        json: {
            chat_type: chatType,
            chat_id: chatId,
            data: { text, images, is_markdown: isMarkdown },
            ...(quoteMsgId != null ? { quote_msg_id: quoteMsgId } : {}),
        },
    });
    if (data?.status?.code !== 0) {
        throw new ApiError(data?.status?.msg || '发送失败', 200);
    }
    return data.msg ?? null;
}

// 撤回:私聊 private/delete_message,群聊 group/recall,请求体都是 {message_id}
export async function recallChatMessage(token, chatType, messageId) {
    const path = chatType === 1 ? '/private/delete_message' : '/group/recall';
    return request(path, { method: 'POST', token, json: { message_id: messageId } });
}

// 编辑:私聊与群聊字段名不同(安卓端 editMessage)
export async function editChatMessage(token, chatType, messageId, { content, images = [], isMarkdown = false }) {
    const path = chatType === 1 ? '/private/edit_message' : '/group/edit_message';
    const payload = chatType === 1
        ? { message_id: messageId, new_content: content, new_images: images, new_is_markdown: isMarkdown }
        : { message_id: messageId, content, images, is_markdown: isMarkdown };
    return request(path, { method: 'POST', token, json: payload });
}

// GroupDetailResponse: { success, group:{id,name,avatar_url,description,is_private,
//   join_verification,share_enabled,members_count,status,created_at,creator}, my_status, my_role }
export async function getGroupDetail(token, groupId) {
    try {
        const data = await request('/group/detail', { method: 'POST', token, json: { group_id: groupId } });
        return data?.success ? data.group : null;
    } catch {
        return null;
    }
}
