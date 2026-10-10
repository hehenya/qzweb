import { useState, useEffect, useRef } from 'react';
import { getChatList, getMyInfo } from '../api/api.js';
import { ensureChatSocket } from '../chatSocket.js';
import { useAdwEvent } from '../adw.js';
import { getThemeMode, applyTheme, cycleThemeMode } from '../theme.js';

const THEME_LABELS = { system: '系统', light: '亮色', dark: '暗色' };

export default function Sidebar({ slot, token, categories, currentCategoryId, onSelectCategory, onSelectChat, onLogout, openLogin, layoutMode, toggleLayout }) {
    // chat/list 返回的会话/好友列表(Friend: username/name/avatar/title/type/unread_count)
    const [chats, setChats] = useState([]);
    const [loadingChats, setLoadingChats] = useState(false);
    const [myInfo, setMyInfo] = useState(null);
    const [themeMode, setThemeMode] = useState(getThemeMode());
    const sidebarRef = useRef(null);

    useEffect(() => {
        if (!token) return;
        let isMounted = true;
        const loadChats = async () => {
            setLoadingChats(true);
            try {
                const data = await getChatList(token, 1, 100);
                if (isMounted) setChats(data.friends || []);
            } catch (err) {
                console.error('加载会话列表失败', err);
            } finally {
                if (isMounted) setLoadingChats(false);
            }
        };
        const loadMyInfo = async () => {
            try {
                const info = await getMyInfo(token);
                if (isMounted) setMyInfo(info);
            } catch (err) {
                if (err?.status === 401) onLogout();
                else console.error('加载个人信息失败', err);
            }
        };
        loadChats();
        loadMyInfo();
        // 聊天实时事件用独立的 ?type=2 socket(与社区 socket 并行,同安卓端)
        ensureChatSocket(token);
        return () => { isMounted = false; };
    }, [token, onLogout]);

    const privates = chats.filter(c => c.type !== 'group');
    const groups = chats.filter(c => c.type === 'group');

    // adw-sidebar 用平铺索引选中:频道 → 私聊 → 群聊(分组标题不占索引)
    // chatType 必须并入 chat 对象传给 ChatView(Friend 本身没有这个字段)
    const flatItems = [
        ...categories.map(c => ({ kind: 'category', id: c.id })),
        ...(token ? privates.map(c => ({ kind: 'chat', chat: { ...c, chatType: 1 } })) : []),
        ...(token ? groups.map(c => ({ kind: 'chat', chat: { ...c, chatType: 2 } })) : []),
    ];

    const selectedFlatIndex = flatItems.findIndex(item =>
        item.kind === 'category' && String(item.id) === String(currentCategoryId)
    );

    useAdwEvent(sidebarRef, 'activated', (e) => {
        const item = flatItems[e.detail?.index];
        if (!item) return;
        if (item.kind === 'category') onSelectCategory(item.id);
        else onSelectChat(item.chat);
    });

    const handleCycleTheme = () => {
        setThemeMode(applyTheme(cycleThemeMode(themeMode)));
    };

    const chatSubtitle = (c) => {
        const preview = c.last_message || (c.type === 'group' ? '群聊' : (c.title || '好友'));
        return c.unread_count > 0 ? `(${c.unread_count}) ${preview}` : preview;
    };

    return (
        <aside className="sidebar-pane" {...(slot ? { slot } : {})}>
            <div className="sidebar-pane-header">
                <span>轻昼</span>
            </div>

            <div className="sidebar-pane-list">
                {categories.length === 0 && !loadingChats ? (
                    <div className="sidebar-loading"><adw-spinner></adw-spinner></div>
                ) : (
                    <adw-sidebar
                        ref={sidebarRef}
                        selected={selectedFlatIndex >= 0 ? String(selectedFlatIndex) : undefined}
                    >
                        <adw-sidebar-section title="频道 · 社区">
                            {categories.map(category => (
                                <adw-sidebar-item
                                    key={`cat-${category.id}`}
                                    title={category.name}
                                    subtitle={category.description || '暂无描述'}
                                ></adw-sidebar-item>
                            ))}
                        </adw-sidebar-section>
                        {token && (
                            <adw-sidebar-section title="私聊">
                                {loadingChats && <adw-spinner></adw-spinner>}
                                {privates.map(chat => (
                                    <adw-sidebar-item
                                        key={`p-${chat.id}`}
                                        title={chat.username || `用户${chat.id}`}
                                        subtitle={chatSubtitle(chat)}
                                    ></adw-sidebar-item>
                                ))}
                            </adw-sidebar-section>
                        )}
                        {token && (
                            <adw-sidebar-section title="群聊">
                                {groups.map(chat => (
                                    <adw-sidebar-item
                                        key={`g-${chat.id}`}
                                        title={chat.name || `群${chat.id}`}
                                        subtitle={chatSubtitle(chat)}
                                    ></adw-sidebar-item>
                                ))}
                            </adw-sidebar-section>
                        )}
                    </adw-sidebar>
                )}
            </div>

            <div className="user-profile-section">
                <adw-avatar
                    text={myInfo?.username || '访客'}
                    size="40"
                    show-initials
                    custom-image={myInfo?.avatar_url || undefined}
                ></adw-avatar>
                <div className="user-details">
                    <div className="user-name">{myInfo?.username || '游客'}</div>
                    <div className={`user-status ${token ? 'connected' : 'off'}`}>{myInfo?.title || '未登录'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <gtk-button flat label={THEME_LABELS[themeMode]} tooltip="切换主题" onClick={handleCycleTheme}></gtk-button>
                </div>
                <gtk-button flat icon="view-list" tooltip={layoutMode === 'chat' ? '切换到论坛模式' : '切换到聊天模式'} onClick={toggleLayout}></gtk-button>
                {token ? (
                    <gtk-button flat icon="logout" tooltip="退出登录" onClick={onLogout}></gtk-button>
                ) : (
                    <gtk-button suggested label="登录" onClick={openLogin}></gtk-button>
                )}
            </div>
        </aside>
    );
}
