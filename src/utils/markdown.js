export function parseMarkdown(text) {
    if (!text) return '';

    text = text.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    text = text.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    text = text.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    text = text.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/gim, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/gim, '<em>$1</em>');
    text = text.replace(/_(.*?)_/gim, '<em>$1</em>');
    text = text.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
    text = text.replace(/`(.*?)`/gim, '<code>$1</code>');
    text = text.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    text = text.replace(/\[([^[]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');
    text = text.replace(/^\s*- (.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    text = text.replace(/^\s*\d+\. (.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    text = text.replace(/\n/gim, '<br>');

    // Do not wrap in a block div to prevent breaking flex layout of msg-bubble, just use class on parent
    let markdownHtml = text;
    return markdownHtml;
}
