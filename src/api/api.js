// 轻昼服务端 API 封装。
// 所有端点、请求体与响应字段均对照 QingZhouCE 安卓源码实现：
//   - ApiClient.kt                登录/注册
//   - community/loadMessages.kt   分区/消息/点赞/删除/回复
//   - community/PostArticleActivity.kt  发帖(post_message)的 message_type 规则
//   - community/UserInfoActivity.kt     user_info/get_user_messages/get_user_resources/follow
//   - message/MessageListViewModel.kt   chat/list(表单编码)
//   - message/MessageActivity.kt        friends/send_request
//   - MainViewModel.kt / data/mine/MyPageData.kt  user_info_token

// 后端不返回 CORS 头,默认走与页面同源的代理(/qz-api,见 vite.config.js 及部署说明);
// 若后端将来开放 CORS,可用 VITE_API_BASE 指定直连地址。
const API_BASE = import.meta.env.VITE_API_BASE || '/qz-api';

// socket.io 服务地址。安卓端 CommunitySocket 连 "wss://host:port/",默认路径 /socket.io,
// 代理模式下连页面自身(经 vite/反代转发),直连模式下连 VITE_API_BASE。
export const WS_URL = import.meta.env.VITE_API_BASE || undefined;

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export async function request(path, { method = 'GET', token, json, form } = {}) {
    const headers = {};
    if (token) headers['x-access-token'] = token;
    let body;
    if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
    } else if (form) {
        // chat/list 在安卓端用的是 OkHttp FormBody(application/x-www-form-urlencoded),
        // 不是 multipart,浏览器端要用 URLSearchParams 而不是 FormData
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(form).toString();
    }

    const res = await fetch(`${API_BASE}${path}`, { method, headers, body });

    let data = null;
    const text = await res.text();
    if (text) {
        try { data = JSON.parse(text); } catch { /* 非 JSON 响应(如空体/网关错误页) */ }
    }

    if (!res.ok) {
        throw new ApiError(data?.message || `HTTP ${res.status}`, res.status);
    }
    return data;
}

// ---------- 登录 / 注册 ----------

function getDeviceId() {
    // 安卓端用 ANDROID_ID 作 X-Device-ID,网页端用持久化的随机 ID 对应
    let id = localStorage.getItem('qzweb_device_id');
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('qzweb_device_id', id);
    }
    return id;
}

// 登录成功返回 { success, token, message };失败(含 401)抛出服务端 message
export async function login(username, password) {
    // LoginRequest: login_method 1=密码登录 2=一点登录;网页端只有密码登录
    const deviceType = 'Web';
    const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Device-Model': deviceType,
            'X-Device-ID': getDeviceId(),
        },
        body: JSON.stringify({ username, password, login_method: 1, device_type: deviceType }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data.token) {
        throw new ApiError(data?.message || '登录失败', res.status);
    }
    return data;
}

// RegisterRequest: { username, password, email }
export async function register(username, password, email) {
    const data = await request('/register', { method: 'POST', json: { username, password, email } });
    if (!data?.success) throw new ApiError(data?.message || '注册失败', 200);
    return data;
}

// ---------- 社区 ----------

// CategoriesResponse: { success, categories: [{id, name, description, avatar_url, created_at, stats, latest_message}] }
export async function getCategories(token) {
    const data = await request('/get_categories', { token });
    if (!data?.success) throw new ApiError(data?.message || '加载分区失败', 200);
    return data.categories || [];
}

// ApiResponse: { success, messages: [Message], pagination: {current_page, total_pages, total_messages} }
// 消息按 message_id 从新到旧排列(第 1 页最新)
export async function getMessages(token, categoryId, page = 1, perPage = 20) {
    const data = await request(`/v3/get_message?page=${page}&per_page=${perPage}&category_id=${categoryId}`, { token });
    if (!data?.success) throw new ApiError(data?.message || '加载消息失败', 200);
    return data;
}

// 与安卓端 PostArticleActivity.postArticle 的载荷规则一致:
//   有标题 → message_type 3(文章: title + content + images?)
//   无标题有图片 → message_type 2(图文: content={images,text}) 或 1(纯图: content=images 数组)
//   纯文字 → message_type 0,content 为字符串
export function buildPostPayload({ categoryId, title = '', content = '', images = [], isMarkdown = false, visibleTo }) {
    const payload = { category_id: String(categoryId), is_markdown: isMarkdown };
    if (title) {
        payload.message_type = 3;
        payload.title = title;
        payload.content = content;
        if (images.length > 0) payload.images = images;
    } else if (images.length > 0) {
        payload.message_type = content ? 2 : 1;
        payload.content = content ? { images, text: content } : images;
    } else {
        payload.message_type = 0;
        payload.content = content;
    }
    if (visibleTo) payload.visible_to = visibleTo;
    return payload;
}

export async function postMessage(token, payload) {
    await request('/post_message', { method: 'POST', token, json: payload });
}

// 回复(loadMessages.postReply): {content, category_id, referenced_message_id?, visible_to?:[user_id]}
export async function postReferencedMessage(token, { content, categoryId, refId, isPrivate = false, targetUserId }) {
    const payload = { content, category_id: categoryId };
    if (refId != null) payload.referenced_message_id = refId;
    if (isPrivate && targetUserId != null) payload.visible_to = [targetUserId];
    await request('/post_referenced_message', { method: 'POST', token, json: payload });
}

// 点赞是开关式切换;安卓端在请求成功后于客户端计算新状态,
// 请求失败时保持原样 —— 这里返回 { isLiked, likeCount } 供调用方直接落状态
export async function toggleLike(token, messageId, wasLiked, currentCount) {
    try {
        // 安卓端把 message_id 编码为字符串(mapOf("message_id" to id.toString()))
        await request('/like_message', { method: 'POST', token, json: { message_id: String(messageId) } });
    } catch {
        return { isLiked: wasLiked, likeCount: currentCount };
    }
    return { isLiked: !wasLiked, likeCount: wasLiked ? currentCount - 1 : currentCount + 1 };
}

// 管理员(userStatus==1)走 admin/delete_message,并多带 operation 字段
export async function deleteMessage(token, userStatus, messageId) {
    const isAdmin = userStatus === 1;
    const payload = { message_id: messageId, status: 1 };
    if (isAdmin) payload.operation = 'single';
    await request(`${isAdmin ? '/admin' : ''}/delete_message`, { method: 'POST', token, json: payload });
}

// 帖子详情(get_message_info): { success, message_info, message }
export async function getMessageInfo(token, messageId) {
    const data = await request('/get_message_info', { method: 'POST', token, json: { message_id: messageId } });
    if (!data?.success) throw new ApiError(data?.message || '加载帖子失败', 200);
    return data.message_info;
}

// 帖子回复列表(get_message_reply): { success, replies, total_replies, pagination }
export async function getMessageReplies(token, messageId, page = 1, perPage = 20) {
    const data = await request('/get_message_reply', {
        method: 'POST', token, json: { message_id: messageId, page, per_page: perPage },
    });
    if (!data?.success) throw new ApiError(data?.message || '加载回复失败', 200);
    return data;
}

// ---------- 用户 ----------

// user_info: { success, user_info: {id, username, avatar_url, bio, level, experience, gold,
//   followers_count, following_count, is_followed(0/1), is_banned, title, title_status,
//   background_url, last_activity_user, ...} }
export async function getUserInfo(token, userId) {
    const data = await request('/user_info', { method: 'POST', token, json: { user_id: userId } });
    return data?.user_info ?? null;
}

// get_user_messages: { messages: [{message_id, username, avatar_url, content, message_type,
//   like_count, timestamp_user, is_markdown, is_referenced, referenced_message}] }
export async function getUserMessages(token, userId, page = 1, perPage = 25) {
    const data = await request('/get_user_messages', {
        method: 'POST', token, json: { user_id: userId, page, per_page: perPage },
    });
    return data?.messages || [];
}

// get_user_resources: { resources: [{icon_url, name, description, version, release_date,
//   developer_name, download_url, developer_info}] }
export async function getUserResources(token, userId) {
    const data = await request('/get_user_resources', { method: 'POST', token, json: { user_id: userId } });
    return data?.resources || [];
}

// follow 为开关式;安卓端只看 HTTP 是否成功
export async function toggleFollow(token, userId) {
    try {
        await request('/follow', { method: 'POST', token, json: { user_id: userId } });
        return true;
    } catch {
        return false;
    }
}

// 当前登录用户(user_info_token,空 JSON 体):
// { success, user_info: {id, username, avatar_url, background_url, bio, gold, level, experience,
//   title, title_status, has_unread_notifications, has_checked_in, following_count, followers_count} }
export async function getMyInfo(token) {
    const data = await request('/user_info_token', { method: 'POST', token, json: {} });
    if (!data?.success) throw new ApiError(data?.message || '加载个人信息失败', 401);
    return data.user_info;
}

// ---------- 会话列表 / 好友 ----------

// chat/list: { success, friends: [{id, username, name, avatar, title, title_status,
//   last_message, last_message_time, unread_count, added_at, type}], pagination }
export async function getChatList(token, page = 1, perPage = 20) {
    const data = await request('/chat/list', { method: 'POST', token, form: { page: String(page), per_page: String(perPage) } });
    if (!data?.success) throw new ApiError(data?.message || '加载会话失败', 200);
    return data;
}

// friends/send_request: { friend_id } → { success }
export async function sendFriendRequest(token, friendId) {
    const data = await request('/friends/send_request', { method: 'POST', token, json: { friend_id: friendId } });
    return Boolean(data?.success);
}
