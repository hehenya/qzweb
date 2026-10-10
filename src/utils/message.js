// 社区 Message(content:{type,text,url,images,title,content}) 的取值辅助,
// 与安卓端 loadMessages/UserInfoActivity 里对 message_type 的分支保持一致:
//   0 纯文字 → content.text
//   1 纯图片 → content.url / content.images
//   2 图文   → content.text + content.images
//   3 文章   → content.title + content.content

export function getMessageText(msg) {
    const content = msg?.content;
    if (!content || typeof content === 'string') return typeof content === 'string' ? content : '';
    if (msg.message_type === 3) return content.content || content.text || '';
    return content.text || '';
}

export function getMessageTitle(msg) {
    if (msg?.message_type !== 3) return '';
    return msg.content?.title || '';
}

export function getMessageImages(msg) {
    const content = msg?.content;
    if (!content || typeof content === 'string') return [];
    if (Array.isArray(content.images) && content.images.length > 0) return content.images;
    if (content.url) return [content.url];
    return [];
}

export function getReferencedSummary(ref) {
    if (!ref) return null;
    const text = ref.content || '';
    const image = ref.image_url || '';
    if (!text && !image) return null;
    return { username: ref.sender_username || '未知用户', text, image };
}
