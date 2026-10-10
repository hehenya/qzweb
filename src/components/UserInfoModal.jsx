import { useState, useEffect, useRef } from 'react';
import { getUserInfo } from '../api/api.js';

export default function UserInfoModal({ token, userId, position, onClose, onNavigate }) {
    const [userInfo, setUserInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const modalRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                setLoading(true);
                const info = await getUserInfo(token, userId);
                if (isMounted) setUserInfo(info);
            } catch (err) {
                console.error('Failed to fetch user info', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, [token, userId]);

    // Handle clicks outside the modal
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Compute safe position so it doesn't overflow
    const safePosition = {
        top: Math.min(position.y, window.innerHeight - 300), // Approx height
        left: Math.min(position.x, window.innerWidth - 280), // Approx width
    };

    return (
        <div className="user-info-modal-backdrop">
            <div ref={modalRef} className="user-info-modal-container" style={{
                top: `${safePosition.top}px`,
                left: `${safePosition.left}px`,
            }}>
                {loading ? (
                    <div className="chat-loading" style={{ padding: '20px' }}>
                        <adw-spinner></adw-spinner>
                    </div>
                ) : userInfo ? (
                    <div className="user-info-modal-content">
                        {/* Background banner */}
                        <div style={{
                            height: '60px',
                            backgroundColor: 'var(--accent-bg-color)',
                            backgroundImage: userInfo.background_url ? `url(${userInfo.background_url})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}></div>

                        <div className="section" style={{ position: 'relative' }}>
                            <adw-avatar
                                text={userInfo.username}
                                size="60"
                                show-initials
                                custom-image={userInfo.avatar_url || undefined}
                                onClick={() => onNavigate(userId)}
                                style={{
                                    marginTop: '-30px',
                                    border: '4px solid var(--popover-bg-color)',
                                    cursor: 'pointer',
                                }}
                            ></adw-avatar>
                            <div style={{ marginTop: '8px' }}>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 'bold' }}>{userInfo.username}</h3>
                                {userInfo.title && (
                                    <span className="title-badge" style={{
                                        fontSize: '12px',
                                        backgroundColor: 'var(--accent-bg-color)',
                                        color: 'var(--accent-fg-color)',
                                        display: 'inline-block',
                                        marginBottom: '8px'
                                    }}>{userInfo.title}</span>
                                )}
                                <div style={{ fontSize: '14px', color: 'var(--qz-dim-fg)', marginBottom: '8px' }}>
                                    等级: {userInfo.level} | 经验: {userInfo.experience}
                                </div>
                                <div style={{ fontSize: '14px', marginBottom: '12px' }}>
                                    {userInfo.bio || '这个人很懒，什么都没写'}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '14px', marginBottom: '16px' }}>
                                    <div><strong>{userInfo.following_count}</strong> 关注</div>
                                    <div><strong>{userInfo.followers_count}</strong> 粉丝</div>
                                </div>
                            </div>

                            <gtk-button suggested label="查看完整个人资料" class="login-button" onClick={() => onNavigate(userId)}></gtk-button>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '20px', textAlign: 'center' }}>加载失败</div>
                )}
            </div>
        </div>
    );
}
