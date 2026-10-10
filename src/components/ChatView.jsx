import { useState, useEffect, useRef, useCallback } from 'react';
import { getChatMessages, sendChatMessage, getGroupDetail } from '../api/chat.js';
import { subscribeChatEvents } from '../chatSocket.js';
import { parseMarkdown } from '../utils/markdown.js';
import UserInfoModal from './UserInfoModal.jsx';

// 会话消息(data/MessageModels.kt 的 Message):内部按 send_time 从新到旧存放,
// 显示时反转让最新消息落在底部(与安卓端 addNewMessage 的 prepend 一致)
function effectiveMsgId(msg) {
    return msg?.msg_id || (msg?.id != null ? String(msg.id) : '');
}

function messageTime(msg) {
    return msg?.timestamp_display || msg?.send_time_display || msg?.send_time_formatted || msg?.timestamp || '';
}

// 分组消息悬停时的短时间(HH:mm);send_time 兼容秒/毫秒时间戳
function sendTimeMs(msg) {
    let t = msg?.send_time || 0;
    if (!t) return 0;
    if (t < 1e12) t *= 1000;
    return t;
}

function shortTime(msg) {
    const t = sendTimeMs(msg);
    if (!t) return '';
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function senderName(msg) {
    return msg?.sender?.name || msg?.sender_username || '';
}

function senderAvatar(msg) {
    return msg?.sender?.avatar_url || msg?.sender_avatar || '';
}

// 消息发送者的用户 id:群聊用 sender_id,私聊兜底用会话对端 id
function senderUserId(msg, chatType, chatId) {
    const uid = msg?.sender_id;
    if (uid != null && uid !== 0) return uid;
    return chatType === 1 ? chatId : null;
}

export default function ChatView({ token, chat, onBack, onNavigateToUser, onUnauthorized }) {
    // chat: { id, chatType: 1|2, username, name, avatar, title }
    // 组件由父级用 key=<chatType>-<id> 挂载,切换会话即整体重建
    const [messages, setMessages] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [canSend, setCanSend] = useState(true);
    const [groupInfo, setGroupInfo] = useState(null);
    const [otherUser, setOtherUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    // 点击头像/昵称弹出的用户信息卡(与社区一致)
    const [modalUserState, setModalUserState] = useState(null);

    const scrollRef = useRef(null);
    // chatType 兜底:正常由 Sidebar 并入;缺失时按 Friend.type 推导(1=私聊 2=群聊)
    const chatType = chat.chatType ?? (chat.type === 'group' ? 2 : 1);
    const chatRef = useRef(chat);
    useEffect(() => { chatRef.current = { ...chat, chatType }; }, [chat, chatType]);

    const scrollToBottom = useCallback((smooth = false) => {
        setTimeout(() => {
            const el = scrollRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        }, 50);
    }, []);

    // ---- 拉取消息(安卓端 loadMessages:page 从 1 起,page 越大越早) ----
    useEffect(() => {
        if (!token || !chat) return undefined;
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const data = await getChatMessages(token, chatType, chat.id, 1);
                if (cancelled) return;
                // 安卓端 refresh 后按 sendTime 从新到旧排序
                const sorted = [...(data.messages || [])].sort((a, b) => (b.send_time || 0) - (a.send_time || 0));
                setMessages(sorted);
                setPagination(data.pagination || null);
                setCanSend(data.can_send !== false);
                setOtherUser(data.other_user || null);
                scrollToBottom();
            } catch (err) {
                if (!cancelled) {
                    if (err?.status === 401) onUnauthorized?.();
                    else console.error('加载会话消息失败', err);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        if (chatType === 2) {
            getGroupDetail(token, chat.id).then(info => { if (!cancelled && info) setGroupInfo(info); });
        }

        return () => { cancelled = true; };
    }, [token, chat, chatType, scrollToBottom, onUnauthorized]);

    // ---- 实时事件(过滤出当前会话,合并规则与安卓端 messageObserver 一致) ----
    useEffect(() => {
        const apply = (type, pushChatId, pushChatType, message) => {
            const current = chatRef.current;
            if (!current || pushChatType !== current.chatType || pushChatId !== String(current.id)) return;

            if (type === 'new') {
                setMessages(prev => {
                    if (prev.some(m => effectiveMsgId(m) === effectiveMsgId(message))) return prev;
                    return [message, ...prev];
                });
                setCanSend(true);
                scrollToBottom(true);
            } else if (type === 'edit') {
                setMessages(prev => prev.map(m => (effectiveMsgId(m) === effectiveMsgId(message) ? message : m)));
            } else if (type === 'recall') {
                setMessages(prev => prev.map(m => {
                    if (effectiveMsgId(m) !== effectiveMsgId(message)) return m;
                    const hint = message.recall_hint || m.recall_hint || '消息已撤回';
                    return { ...m, content: '', images: [], is_recalled: true, msg_delete_time: Date.now(), recall_hint: hint };
                }));
            }
        };
        return subscribeChatEvents(apply);
    }, [scrollToBottom]);

    const handleScroll = async (e) => {
        const target = e.target;
        if (target.scrollTop > 120 || loading || loadingMore) return;
        const nextPage = (pagination?.page || 1) + 1;
        if (pagination && pagination.page >= pagination.pages) return;

        setLoadingMore(true);
        const prevScrollHeight = target.scrollHeight;
        const prevScrollTop = target.scrollTop;
        try {
            const data = await getChatMessages(token, chatType, chat.id, nextPage);
            const sorted = [...(data.messages || [])].sort((a, b) => (b.send_time || 0) - (a.send_time || 0));
            setMessages(prev => {
                const seen = new Set(prev.map(effectiveMsgId));
                return [...prev, ...sorted.filter(m => !seen.has(effectiveMsgId(m)))];
            });
            setPagination(data.pagination || null);
            // 顶部插入更早的消息后保持视口位置
            setTimeout(() => {
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop;
            }, 60);
        } catch (err) {
            if (err?.status === 401) onUnauthorized?.();
            else console.error('加载更早消息失败', err);
        } finally {
            setLoadingMore(false);
        }
    };

    // ---- 发送 ----
    const handleSend = async () => {
        const text = inputValue.trim();
        if ((!text && !(replyTo)) || sending || !canSend) return;
        setSending(true);
        try {
            const echo = await sendChatMessage(token, chatType, chat.id, {
                text,
                quoteMsgId: replyTo ? effectiveMsgId(replyTo) : undefined,
            });
            setInputValue('');
            setReplyTo(null);
            if (echo) {
                // 服务端回显先落一条;WS 广播同名消息会被去重
                setMessages(prev => {
                    if (prev.some(m => effectiveMsgId(m) === effectiveMsgId(echo))) return prev;
                    return [echo, ...prev];
                });
                scrollToBottom(true);
            }
        } catch (err) {
            if (err?.status === 401) onUnauthorized?.();
            else console.error('发送失败', err);
        } finally {
            setSending(false);
        }
    };

    // 输入框随内容自动长高(单行起步,封顶 120px)
    const inputRef = useRef(null);
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [inputValue]);

    const handleInputKeyDown = (e) => {
        // 输入法组词期间的 Enter 不当作发送或换行
        if (e.nativeEvent.isComposing) return;
        const isPC = window.innerWidth > 840 && !('ontouchstart' in window);
        if (isPC && e.key === 'Enter') {
            if (e.ctrlKey) {
                setInputValue(prev => prev + '\n');
                e.preventDefault();
            } else if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        }
    };

    // ---- 渲染 ----
    const isGroup = chatType === 2;
    const headerTitle = isGroup
        ? (groupInfo?.name || chat.name || `群聊${chat.id}`)
        : (otherUser?.username || chat.username || chat.name || `用户${chat.id}`);
    const headerSubtitle = isGroup
        ? (groupInfo ? `${groupInfo.members_count ?? 0} 名成员` : (chat.title || '群聊'))
        : (chat.title || otherUser?.title || '私聊');
    const headerAvatar = isGroup ? (groupInfo?.avatar_url || chat.avatar) : (otherUser?.avatar || chat.avatar);

    const displayMessages = [...messages].reverse(); // 旧 → 新

    return (
        <main className="main-pane chatview-mode">
            <adw-toolbar-view>
                    <adw-header-bar slot="top" title={headerTitle} subtitle={headerSubtitle}>
                        <gtk-button slot="start" flat icon="go-previous" tooltip="返回" onClick={onBack}></gtk-button>
                        {headerAvatar && (
                            <img
                                slot="end"
                                className="chatview-header-avatar"
                                src={headerAvatar}
                                alt={headerTitle}
                                onClick={() => { if (!isGroup) onNavigateToUser?.(chat.id); }}
                                style={{ cursor: isGroup ? 'default' : 'pointer' }}
                            />
                        )}
                    </adw-header-bar>

                    <div className="chatview-body" ref={scrollRef} onScroll={handleScroll}>
                        {loading && <div className="chat-loading"><adw-spinner></adw-spinner></div>}
                        {!loading && displayMessages.length === 0 && (
                            <adw-status-page icon="mail-unread" title="暂无消息" description="发送第一条消息吧"></adw-status-page>
                        )}

                        {(() => {
                            // Discord 式分组:同一发送者 5 分钟内的连续消息只显示一个头像/名字行,
                            // 系统/撤回消息与引用回复会打断分组。先算标记再渲染。
                            const GROUP_WINDOW = 5 * 60 * 1000;
                            const rows = [];
                            let prev = null;
                            for (const msg of displayMessages) {
                                const recalled = msg.msg_delete_time != null || msg.is_recalled;
                                if (recalled || msg.is_system) {
                                    rows.push({ msg, compact: false, system: true });
                                    prev = null;
                                    continue;
                                }
                                const sameSender = prev != null
                                    && (prev.sender_id ?? prev.sender?.name ?? prev.sender_username)
                                      === (msg.sender_id ?? msg.sender?.name ?? msg.sender_username);
                                const compact = Boolean(prev
                                    && sameSender
                                    && !msg.quote_msg_info
                                    && sendTimeMs(msg) > 0
                                    && sendTimeMs(prev) > 0
                                    && sendTimeMs(msg) - sendTimeMs(prev) < GROUP_WINDOW);
                                rows.push({ msg, compact, system: false });
                                prev = msg;
                            }

                            return rows.map(({ msg, compact, system }) => {
                                const name = senderName(msg);
                                const avatar = senderAvatar(msg);
                                const time = messageTime(msg);
                                const quote = msg.quote_msg_info;
                                const tags = Array.isArray(msg.sender?.tag) ? msg.sender.tag : [];

                                if (system) {
                                    const recalled = msg.msg_delete_time != null || msg.is_recalled;
                                    return (
                                        <div className="chatview-system-row" key={effectiveMsgId(msg)}>
                                            <span className="chatview-system-chip">{recalled ? (msg.recall_hint || '消息已撤回') : msg.content}</span>
                                        </div>
                                    );
                                }

                                const openUserInfo = (e) => {
                                    const uid = senderUserId(msg, chatType, chat.id);
                                    if (uid == null) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setModalUserState({ userId: uid, position: { x: rect.left, y: rect.bottom + 5 } });
                                };
                                return (
                                    <div className={`message-group${compact ? ' compact' : ''}`} key={effectiveMsgId(msg)}>
                                        {compact ? (
                                            <span className="compact-gutter" aria-hidden="true">
                                                {shortTime(msg) && <span className="compact-time">{shortTime(msg)}</span>}
                                            </span>
                                        ) : (
                                            <adw-avatar
                                                text={name || '?'}
                                                size="44"
                                                show-initials
                                                custom-image={avatar || undefined}
                                                onClick={openUserInfo}
                                            ></adw-avatar>
                                        )}
                                    <div className="msg-content-wrapper">
                                        {!compact && (
                                            <div className="msg-header">
                                                <span className="msg-author" onClick={openUserInfo}>{name}</span>
                                                {tags.map(t => (
                                                    <span
                                                        key={t.id ?? t.text}
                                                        className="title-badge"
                                                    style={{
                                                        color: t.color || 'var(--qz-dim-fg)',
                                                        backgroundColor: t.color ? `color-mix(in srgb, ${t.color} 15%, transparent)` : undefined,
                                                    }}
                                                >{t.text}</span>
                                            ))}
                                            {time && <span className="msg-time">{time}</span>}
                                            </div>
                                        )}
                                        <div className="msg-bubble">
                                            {quote && (
                                                <div className="msg-quote">
                                                    <span className="msg-quote-author">{quote.sender_username || '用户'}</span>
                                                    {quote.content && <div className="msg-quote-text">{quote.content}</div>}
                                                    {Array.isArray(quote.images) && quote.images.length > 0 && (
                                                        <img className="msg-image" src={quote.images[0]} alt="引用图片" loading="lazy" />
                                                    )}
                                                </div>
                                            )}
                                            {msg.content && (msg.is_markdown
                                                ? <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                                                : <div className="message-content">{msg.content}</div>
                                            )}
                                            {(msg.images || []).map(url => (
                                                <img key={url} className="msg-image" src={url} alt="消息图片" loading="lazy" />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                            });
                        })()}
                    </div>

                    <div slot="bottom" className="chat-input-area">
                        {replyTo && (
                            <div className="reply-bar">
                                <span>回复 @{senderName(replyTo) || '用户'}：{(replyTo.content || '[图片]').slice(0, 40)}</span>
                                <gtk-button flat icon="window-close" tooltip="取消回复" onClick={() => setReplyTo(null)}></gtk-button>
                            </div>
                        )}
                        {!canSend && (
                            <div className="chatview-cannot-send">当前会话无法发送消息</div>
                        )}
                        <div className="input-bar">
                            <textarea
                                ref={inputRef}
                                className="adw-entry"
                                rows={1}
                                placeholder={canSend ? (isGroup ? '在群里发送消息...' : '发送消息...') : '无法发送'}
                                value={inputValue}
                                disabled={!canSend}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleInputKeyDown}
                            ></textarea>
                            <gtk-button suggested circular icon="mail-send" tooltip="发送" disabled={sending || !canSend} onClick={handleSend}></gtk-button>
                        </div>
                    </div>
                </adw-toolbar-view>

            {modalUserState && (
                <UserInfoModal
                    token={token}
                    userId={modalUserState.userId}
                    position={modalUserState.position}
                    onClose={() => setModalUserState(null)}
                    onNavigate={(id) => {
                        setModalUserState(null);
                        onNavigateToUser?.(id);
                    }}
                />
            )}
        </main>
    );
}
