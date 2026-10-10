import { useState, useEffect, useRef } from 'react';
import { getUserInfo, getUserMessages, getUserResources, toggleFollow } from '../api/api.js';
import { parseMarkdown } from '../utils/markdown.js';
import { getMessageText, getMessageTitle, getMessageImages, getReferencedSummary } from '../utils/message.js';
import { useAdwEvent } from '../adw.js';

function PostCard({ msg }) {
    const title = getMessageTitle(msg);
    const text = getMessageText(msg);
    const images = getMessageImages(msg);
    const ref = getReferencedSummary(msg.referenced_message);

    return (
        <adw-card className="user-post-card" style={{ padding: '16px' }}>
            <div className="user-post-meta">
                <time>{msg.timestamp_user || '刚刚'}</time>
                {(msg.like_count || 0) > 0 && <span>❤ {msg.like_count}</span>}
            </div>
            {title && <h3 style={{ margin: '8px 0' }}>{title}</h3>}
            {ref && (
                <div className="msg-quote">
                    <span className="msg-quote-author">回复 @{ref.username}</span>
                    {ref.text && <div className="msg-quote-text">{ref.text}</div>}
                </div>
            )}
            {text && (msg.is_markdown
                ? <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(text) }} />
                : <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            )}
            {images.map(url => (
                <img key={url} className="msg-image" src={url} alt="帖子图片" loading="lazy" />
            ))}
        </adw-card>
    );
}

function ResourceCard({ item }) {
    return (
        <adw-card className="user-post-card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            {item.icon_url && <img src={item.icon_url} alt={item.name} width="48" height="48" style={{ borderRadius: '8px' }} />}
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{ margin: 0 }}>{item.name}</h3>
                    {item.version && <span className="level-badge">v{item.version}</span>}
                </div>
                <p style={{ margin: '6px 0', fontSize: '14px' }}>{item.description}</p>
                <div style={{ fontSize: '12px', color: 'var(--qz-dim-fg)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {item.developer_name && <span>开发者: {item.developer_name}</span>}
                    {item.release_date && <span>上传时间: {item.release_date}</span>}
                </div>
            </div>
            {item.download_url && (
                <a href={item.download_url} target="_blank" rel="noreferrer">
                    <gtk-button suggested label="下载"></gtk-button>
                </a>
            )}
        </adw-card>
    );
}

export default function UserDetail({ token, userId, onBack }) {
    const [userInfo, setUserInfo] = useState(null);
    const [posts, setPosts] = useState([]);
    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [isFollowed, setIsFollowed] = useState(false);
    const tabsRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const loadAll = async () => {
            setLoading(true);
            setLoadFailed(false);
            try {
                const info = await getUserInfo(token, userId);
                if (cancelled) return;
                if (info) {
                    setUserInfo(info);
                    setIsFollowed(Number(info.is_followed) === 1);
                } else {
                    setLoadFailed(true);
                }
                // 帖子/资源任一失败不阻塞资料展示
                getUserMessages(token, userId, 1, 25)
                    .then(list => { if (!cancelled) setPosts(list); })
                    .catch(err => console.error('加载用户帖子失败', err));
                getUserResources(token, userId)
                    .then(list => { if (!cancelled) setResources(list); })
                    .catch(err => console.error('加载用户资源失败', err));
            } catch (err) {
                console.error('加载用户资料失败', err);
                if (!cancelled) setLoadFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        if (userId) loadAll();
        return () => { cancelled = true; };
    }, [token, userId]);

    useAdwEvent(tabsRef, 'notify::active', (e) => {
        setActiveTabIndex(Number(e.detail?.active ?? 0));
    });

    const handleFollow = async () => {
        const ok = await toggleFollow(token, userId);
        if (ok) setIsFollowed(!isFollowed);
    };

    if (loading) {
        return (
            <main className="main-pane" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <adw-spinner></adw-spinner>
            </main>
        );
    }

    if (!userInfo) {
        return (
            <main className="main-pane">
                <adw-toolbar-view>
                    <adw-header-bar slot="top" title="用户资料">
                        <gtk-button slot="start" flat icon="go-previous" tooltip="返回" onClick={onBack}></gtk-button>
                    </adw-header-bar>
                    <adw-status-page
                        icon="avatar-default"
                        title={loadFailed ? '无法加载用户资料' : '用户不存在'}
                    >
                        <gtk-button slot="child" label="返回" onClick={onBack}></gtk-button>
                    </adw-status-page>
                </adw-toolbar-view>
            </main>
        );
    }

    return (
        <main className="main-pane">
            <adw-toolbar-view>
                <adw-header-bar slot="top" title="用户资料">
                    <gtk-button slot="start" flat icon="go-previous" tooltip="返回" onClick={onBack}></gtk-button>
                </adw-header-bar>

                <div className="user-detail-scroll">
                    <div className="user-detail-header-card">
                        <div style={{
                            height: '150px',
                            backgroundColor: 'var(--accent-bg-color)',
                            backgroundImage: userInfo.background_url ? `url(${userInfo.background_url})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}></div>
                        <div style={{ padding: '0 24px 24px 24px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <adw-avatar
                                    text={userInfo.username}
                                    size="100"
                                    show-initials
                                    custom-image={userInfo.avatar_url || undefined}
                                    style={{
                                        marginTop: '-50px',
                                        border: '4px solid var(--view-bg-color)',
                                        backgroundColor: 'var(--view-bg-color)',
                                    }}
                                ></adw-avatar>
                                <div style={{ marginTop: '16px' }}>
                                    <gtk-button
                                        suggested={!isFollowed}
                                        label={isFollowed ? '已关注' : '关注'}
                                        onClick={handleFollow}
                                    ></gtk-button>
                                </div>
                            </div>

                            <div style={{ marginTop: '12px' }}>
                                <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {userInfo.username}
                                    {userInfo.title && (
                                        <span className="title-badge" style={{
                                            fontSize: '12px',
                                            padding: '4px 8px',
                                            backgroundColor: 'var(--accent-bg-color)',
                                            color: 'var(--accent-fg-color)',
                                        }}>{userInfo.title}</span>
                                    )}
                                </h2>

                                <div style={{ fontSize: '14px', color: 'var(--qz-dim-fg)', marginBottom: '8px', display: 'flex', gap: '16px' }}>
                                    <span>等级: {userInfo.level}</span>
                                    <span>经验: {userInfo.experience}</span>
                                    <span>金币: {userInfo.gold}</span>
                                    {userInfo.last_activity_user && <span>活跃: {userInfo.last_activity_user}</span>}
                                </div>

                                <p style={{ margin: '0 0 16px 0', fontSize: '15px' }}>
                                    {userInfo.bio || '这个人很懒，什么都没写'}
                                </p>

                                <div style={{ display: 'flex', gap: '24px', fontSize: '15px' }}>
                                    <div><strong style={{ fontSize: '16px' }}>{userInfo.following_count}</strong> <span style={{ color: 'var(--qz-dim-fg)' }}>关注</span></div>
                                    <div><strong style={{ fontSize: '16px' }}>{userInfo.followers_count}</strong> <span style={{ color: 'var(--qz-dim-fg)' }}>粉丝</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="user-tabs" style={{ padding: '8px 16px', borderBottom: '1px solid var(--separator-color)' }}>
                        <adw-toggle-group ref={tabsRef} active={String(activeTabIndex)} style={{ width: '100%' }}>
                            <adw-toggle label="最近帖子"></adw-toggle>
                            <adw-toggle label="资源"></adw-toggle>
                        </adw-toggle-group>
                    </div>

                    <div style={{ padding: '16px' }}>
                        {activeTabIndex === 0 && (
                            <div className="user-posts-list">
                                {posts.length === 0 ? (
                                    <adw-status-page icon="document-edit" title="暂无帖子"></adw-status-page>
                                ) : (
                                    posts.map(msg => <PostCard key={msg.message_id} msg={msg} />)
                                )}
                            </div>
                        )}

                        {activeTabIndex === 1 && (
                            <div className="user-posts-list">
                                {resources.length === 0 ? (
                                    <adw-status-page icon="folder" title="暂无资源"></adw-status-page>
                                ) : (
                                    resources.map((item, i) => <ResourceCard key={`${item.name}-${i}`} item={item} />)
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </adw-toolbar-view>
        </main>
    );
}
