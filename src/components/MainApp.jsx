import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './Sidebar.jsx';
import ChatArea from './ChatArea.jsx';
import ChatView from './ChatView.jsx';
import UserDetail from './UserDetail.jsx';
import { useAdwEvent } from '../adw.js';
import { getCategories } from '../api/api.js';

export default function MainApp({ token, onLogout, openLogin }) {
    const [categories, setCategories] = useState([]);
    const [currentCategoryId, setCurrentCategoryId] = useState(null);
    const [layoutMode, setLayoutMode] = useState(localStorage.getItem('qzweb_layout') || 'chat');
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 720);
    const [viewedUserId, setViewedUserId] = useState(null);
    // 当前打开的私聊/群聊: {id, chatType: 1|2, username, name, avatar, title};null 表示社区视图
    const [activeChat, setActiveChat] = useState(null);
    const splitViewRef = useRef(null);

    // 元素自身(点遮罩、断点折叠)开合侧栏时反向同步 React 状态
    useAdwEvent(splitViewRef, 'sidebar-toggled', (e) => {
        setIsSidebarOpen(Boolean(e.detail?.isVisible));
    });

    const handleUnauthorized = useCallback(() => {
        onLogout();
    }, [onLogout]);

    useEffect(() => {
        let cancelled = false;
        const fetchCategories = async () => {
            try {
                const cats = await getCategories(token);
                if (!cancelled) setCategories(cats);
            } catch (err) {
                console.error('加载分区失败', err);
                if (err?.status === 401 && !cancelled) handleUnauthorized();
            }
        };
        fetchCategories();
        return () => { cancelled = true; };
    }, [token, handleUnauthorized]);

    const toggleLayout = () => {
        const newMode = layoutMode === 'chat' ? 'forum' : 'chat';
        setLayoutMode(newMode);
        localStorage.setItem('qzweb_layout', newMode);
    };

    // 选中后只在抽屉态(断点折叠)收起侧栏;宽屏常驻
    const closeSidebarIfCollapsed = () => {
        if (splitViewRef.current?.collapsed) setIsSidebarOpen(false);
    };

    const handleSelectCategory = (id) => {
        setCurrentCategoryId(id);
        setActiveChat(null);
        closeSidebarIfCollapsed();
    };

    const handleSelectChat = (chat) => {
        setActiveChat(chat);
        closeSidebarIfCollapsed();
    };

    const handleNavigateToUser = (id) => {
        setViewedUserId(id);
        closeSidebarIfCollapsed();
    };

    const isChatView = Boolean(activeChat) && !viewedUserId;

    return (
        <adw-overlay-split-view
            ref={splitViewRef}
            breakpoint="max-width: 720px"
            show-sidebar={isSidebarOpen}
        >
            <Sidebar
                slot="sidebar"
                token={token}
                categories={categories}
                currentCategoryId={isChatView || viewedUserId ? null : currentCategoryId}
                onSelectCategory={handleSelectCategory}
                onSelectChat={handleSelectChat}
                onLogout={onLogout}
                openLogin={openLogin}
                layoutMode={layoutMode}
                toggleLayout={toggleLayout}
                onNavigateToUser={handleNavigateToUser}
            />
            {viewedUserId ? (
                <UserDetail
                    token={token}
                    userId={viewedUserId}
                    onBack={() => setViewedUserId(null)}
                />
            ) : activeChat ? (
                <ChatView
                    key={`${activeChat.chatType}-${activeChat.id}`}
                    token={token}
                    chat={activeChat}
                    onBack={() => setActiveChat(null)}
                    onNavigateToUser={handleNavigateToUser}
                    onUnauthorized={handleUnauthorized}
                />
            ) : (
                <ChatArea
                    token={token}
                    currentCategory={categories.find(c => String(c.id) === String(currentCategoryId))}
                    layoutMode={layoutMode}
                    toggleSidebar={() => setIsSidebarOpen(v => !v)}
                    onNavigateToUser={handleNavigateToUser}
                    onUnauthorized={handleUnauthorized}
                    openLogin={openLogin}
                />
            )}
        </adw-overlay-split-view>
    );
}
