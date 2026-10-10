import { useState, useEffect, useRef, useCallback } from 'react';
import { getMessages, buildPostPayload, postMessage, postReferencedMessage, toggleLike } from '../api/api.js';
import { useCommunitySocket } from '../hooks/useSocket.js';
import { parseMarkdown } from '../utils/markdown.js';
import { getMessageText, getMessageTitle, getMessageImages, getReferencedSummary } from '../utils/message.js';
import { useAdwEvent } from '../adw.js';
import UserInfoModal from './UserInfoModal.jsx';

export default function ChatArea({ token, currentCategory, layoutMode, toggleSidebar, onNavigateToUser, onUnauthorized, openLogin }) {
    // 消息数组保持接口返回顺序(message_id 从新到旧);聊天视图渲染时再反转
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [inputValue, setInputValue] = useState('');
    const [postTitle, setPostTitle] = useState('');
    const [isMarkdown, setIsMarkdown] = useState(false);
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [modalUserState, setModalUserState] = useState(null);

    const messagesListRef = useRef(null);
    const toastRef = useRef(null);
    const markdownCheckRef = useRef(null);

    const showToast = (title) => {
        toastRef.current?.addToast(title);
    };

    const handleError = useCallback((err, fallback) => {
        if (err?.status === 401) {
            onUnauthorized?.();
            return;
        }
        console.error(err);
        showToast(fallback);
    }, [onUnauthorized]);

    // ---- socket.io 实时事件(与安卓端 CommunityViewModel.handleSocketEvent 一致) ----
    const handleNewMessage = useCallback((msg) => {
        if (msg?.category_id !== currentCategory?.id) return;
        setMessages(prev => {
            if (prev.some(m => m.message_id === msg.message_id)) return prev;
            return [msg, ...prev];
        });
    }, [currentCategory]);

    const handleMessageEdited = useCallback((msg) => {
        if (!msg?.message_id) return;
        setMessages(prev => prev.map(m => (m.message_id === msg.message_id ? msg : m)));
    }, []);

    const handleMessageDeleted = useCallback((messageId) => {
        setMessages(prev => prev.filter(m => m.message_id !== messageId));
    }, []);

    const handleLikeUpdate = useCallback((messageId, likeCount) => {
        setMessages(prev => prev.map(m => (m.message_id === messageId ? { ...m, like_count: likeCount } : m)));
    }, []);

    const { status } = useCommunitySocket(token, currentCategory?.id, {
        onNewMessage: handleNewMessage,
        onMessageEdited: handleMessageEdited,
        onMessageDeleted: handleMessageDeleted,
        onLikeUpdate: handleLikeUpdate,
    });

    useAdwEvent(markdownCheckRef, 'notify::checked', (e) => {
        setIsMarkdown(Boolean(e.detail?.checked));
    });

    const handleUserClick = (e, msgUserId) => {
        if (!msgUserId) return;
        if (layoutMode === 'forum') {
            onNavigateToUser(msgUserId);
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            setModalUserState({
                userId: msgUserId,
                position: { x: rect.left, y: rect.bottom + 5 }
            });
        }
    };

    // ---- 拉取消息 ----
    useEffect(() => {
        if (!currentCategory) return;

        let cancelled = false;
        const fetchMessages = async () => {
            setLoading(true);
            try {
                const data = await getMessages(token, currentCategory.id, 1);
                if (cancelled) return;
                setMessages(data.messages || []);
                setPage(data.pagination?.current_page || 1);
                setTotalPages(data.pagination?.total_pages || 1);
            } catch (err) {
                if (!cancelled) handleError(err, '消息加载失败');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchMessages();
        return () => { cancelled = true; };
    }, [currentCategory, token, handleError]);

    useEffect(() => {
        if (!loading && messagesListRef.current && page === 1 && messages.length > 0) {
            setTimeout(() => {
                if (messagesListRef.current) {
                    if (layoutMode === 'forum') {
                        messagesListRef.current.scrollTop = 0;
                    } else {
                        messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
                    }
                }
            }, 50);
        }
    }, [loading, currentCategory, layoutMode, page, messages.length]);

    const handleScroll = async (e) => {
        const target = e.target;
        const isNearBottom = target.scrollHeight - target.clientHeight <= target.scrollTop + 100;
        const isNearTop = target.scrollTop <= 100;

        // 聊天模式下上滑加载更早的历史,论坛模式下下滑加载更多
        const shouldLoadMore = layoutMode === 'forum' ? isNearBottom : isNearTop;

        if (shouldLoadMore && page < totalPages && !loading) {
            setLoading(true);
            const prevScrollHeight = target.scrollHeight;
            const prevScrollTop = target.scrollTop;
            try {
                const nextPage = page + 1;
                // 接口按从新到旧分页,下一页是更早的消息,追加到数组尾部
                const data = await getMessages(token, currentCategory.id, nextPage);
                setMessages(prev => {
                    const existing = new Set(prev.map(m => m.message_id));
                    return [...prev, ...(data.messages || []).filter(m => !existing.has(m.message_id))];
                });
                setPage(nextPage);

                if (layoutMode !== 'forum') {
                    setTimeout(() => {
                        if (messagesListRef.current) {
                            messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight - prevScrollHeight + prevScrollTop;
                        }
                    }, 10);
                }
            } catch (err) {
                handleError(err, '加载更多消息失败');
            } finally {
                setLoading(false);
            }
        }
    };

    // ---- 发送 ----
    const handleSend = async () => {
        if (!token) {
            openLogin?.();
            return;
        }
        const content = inputValue.trim();
        if (!content || !currentCategory || sending) return;

        setSending(true);
        try {
            if (replyTo) {
                await postReferencedMessage(token, {
                    content,
                    categoryId: currentCategory.id,
                    refId: replyTo.message_id,
                });
            } else if (layoutMode === 'forum') {
                await postMessage(token, buildPostPayload({
                    categoryId: currentCategory.id,
                    title: postTitle.trim(),
                    content,
                    isMarkdown,
                }));
            } else {
                await postMessage(token, buildPostPayload({
                    categoryId: currentCategory.id,
                    content,
                    isMarkdown: false,
                }));
            }
            setInputValue('');
            setPostTitle('');
            setReplyTo(null);
        } catch (err) {
            handleError(err, replyTo ? '回复失败，请重试' : '发送失败，请重试');
        } finally {
            setSending(false);
        }
    };

    const handleLike = async (msg) => {
        if (!token) {
            openLogin?.();
            return;
        }
        // 先本地落状态再请求,失败时 toggleLike 会返回原状态
        const { isLiked, likeCount } = await toggleLike(token, msg.message_id, Boolean(msg.is_liked), msg.like_count || 0);
        setMessages(prev => prev.map(m => (m.message_id === msg.message_id ? { ...m, is_liked: isLiked, like_count: likeCount } : m)));
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

    const getTitleColor = (titleStatus) => {
        switch (Number(titleStatus)) {
            case 1: return 'var(--error-color)';
            case 2: return 'var(--warning-color)';
            case 4: return 'var(--accent-color)';
            default: return 'var(--qz-dim-fg)';
        }
    };

    const renderMessageBody = (msg) => {
        const text = getMessageText(msg);
        const images = getMessageImages(msg);
        const ref = getReferencedSummary(msg.referenced_message);

        return (
            <>
                {ref && (
                    <div className="msg-quote">
                        <span className="msg-quote-author">回复 @{ref.username}</span>
                        {ref.text && <div className="msg-quote-text">{ref.text}</div>}
                        {ref.image && <img className="msg-image" src={ref.image} alt="引用图片" loading="lazy" />}
                    </div>
                )}
                {getMessageTitle(msg) && <div className="msg-article-title">{getMessageTitle(msg)}</div>}
                {text && (msg.is_markdown
                    ? <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(text) }} />
                    : <div className="message-content">{text}</div>
                )}
                {images.map(url => (
                    <img key={url} className="msg-image" src={url} alt="消息图片" loading="lazy" />
                ))}
            </>
        );
    };

    const headerTitle = currentCategory ? currentCategory.name : '请选择频道';
    const headerSubtitle = currentCategory ? (currentCategory.description || '') : '轻昼 - 选择左侧频道开始';

    return (
        <main className={layoutMode === 'forum' ? 'main-pane forum-mode' : 'main-pane'}>
            <adw-toast-overlay ref={toastRef}>
                <adw-toolbar-view>
                    <adw-header-bar slot="top" title={headerTitle} subtitle={headerSubtitle}>
                        <gtk-button slot="start" flat icon="sidebar-show" tooltip="开合侧栏" onClick={toggleSidebar}></gtk-button>
                        <span slot="end" className={`connection-chip ${status === 'connected' ? 'connected' : 'off'}`}>
                            {status === 'connected' ? '已连接' : '未连接'}
                        </span>
                    </adw-header-bar>

                    <div className="chat-body-wrapper">
                        <div className="chat-main-column">
                            <div className="messages-area" ref={messagesListRef} onScroll={handleScroll}>
                                {loading && page === 1 && (
                                    <div className="chat-loading"><adw-spinner></adw-spinner></div>
                                )}
                                {!loading && messages.length === 0 && (
                                    <adw-status-page
                                        icon="system-search"
                                        title="暂无消息"
                                        description={currentCategory ? '发送第一条消息吧' : '选择左侧频道开始聊天'}
                                    ></adw-status-page>
                                )}

                                {(() => {
                                    const list = layoutMode === 'forum' ? messages : [...messages].reverse();
                                    return list.map(msg => {
                                        const level = msg.user_level;
                                        const titleStatus = msg.tag_status;
                                        return (
                                            <div className="message-group" key={msg.message_id}>
                                                <adw-avatar
                                                    text={msg.username}
                                                    size="44"
                                                    show-initials
                                                    custom-image={msg.avatar_url || undefined}
                                                    onClick={(e) => handleUserClick(e, msg.userid)}
                                                ></adw-avatar>
                                                <div className="msg-content-wrapper">
                                                    <div className="msg-header">
                                                        <span className="msg-author" onClick={(e) => handleUserClick(e, msg.userid)}>
                                                            {msg.username}
                                                        </span>
                                                        {(level !== undefined && parseInt(level, 10) > 0) && (
                                                            <span className="level-badge">Lv.{level}</span>
                                                        )}
                                                        {msg.tag && (
                                                            <span className="title-badge" style={{
                                                                color: getTitleColor(titleStatus),
                                                                backgroundColor: `color-mix(in srgb, ${getTitleColor(titleStatus)} 15%, transparent)`
                                                            }}>{msg.tag}</span>
                                                        )}
                                                        <span className="msg-time" title={msg.timestamp || ''}>{msg.timestamp_user || msg.timestamp}</span>
                                                    </div>
                                                    <div className="msg-bubble">
                                                        {renderMessageBody(msg)}
                                                    </div>
                                                    <div className="msg-actions">
                                                        <button
                                                            type="button"
                                                            className={`message-like${msg.is_liked ? ' liked' : ''}`}
                                                            onClick={() => handleLike(msg)}
                                                        >❤ {msg.like_count || 0}</button>
                                                        <button
                                                            type="button"
                                                            className="message-like"
                                                            onClick={() => setReplyTo(msg)}
                                                        >回复</button>
                                                        {msg.is_edited === 1 && <span className="msg-edited-hint">已编辑</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* 论坛模式右侧发布栏 */}
                        <div className="forum-post-editor-area">
                            <div className="editor-header">发布新帖子</div>
                            <input
                                className="adw-entry forum-title-input"
                                placeholder="标题(可留空)"
                                value={postTitle}
                                onChange={(e) => setPostTitle(e.target.value)}
                            />
                            <textarea
                                className="adw-entry"
                                placeholder="正文内容"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                            ></textarea>
                            <gtk-check-button
                                ref={markdownCheckRef}
                                label="使用 Markdown 格式渲染"
                                checked={isMarkdown}
                            ></gtk-check-button>
                            <div className="forum-editor-footer">
                                <gtk-button suggested icon="mail-send" label={sending ? '发布中...' : '发布帖子'} disabled={sending} onClick={handleSend}></gtk-button>
                            </div>
                        </div>
                    </div>

                    <div slot="bottom" className={layoutMode === 'forum' ? 'chat-input-area hidden' : 'chat-input-area'}>
                        {replyTo && (
                            <div className="reply-bar">
                                <span>回复 @{replyTo.username}：{(getMessageText(replyTo) || '[图片]').slice(0, 40)}</span>
                                <gtk-button flat icon="window-close" tooltip="取消回复" onClick={() => setReplyTo(null)}></gtk-button>
                            </div>
                        )}
                        <div className="input-bar">
                            <textarea
                                ref={inputRef}
                                className="adw-entry"
                                rows={1}
                                placeholder="在频道中发送消息..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleInputKeyDown}
                            ></textarea>
                            <gtk-button suggested circular icon="mail-send" tooltip="发送" disabled={sending} onClick={handleSend}></gtk-button>
                        </div>
                    </div>
                </adw-toolbar-view>
            </adw-toast-overlay>

            {modalUserState && (
                <UserInfoModal
                    token={token}
                    userId={modalUserState.userId}
                    position={modalUserState.position}
                    onClose={() => setModalUserState(null)}
                    onNavigate={(id) => {
                        setModalUserState(null);
                        onNavigateToUser(id);
                    }}
                />
            )}
        </main>
    );
}
