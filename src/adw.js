// @gjsify/adwaita-web 与 React 的集成辅助。
// React 合成事件只覆盖原生事件;组件库的自定义事件(notify::selected、
// activated、notify::checked、sidebar-toggled、entry-activated 等)必须用
// ref + addEventListener 挂接。

import { useEffect, useRef, useState } from 'react';
import { registerIcon } from '@gjsify/adwaita-web';

// adwaita-web 的容器元素(header-bar/toolbar-view/overlay-split-view/toast-overlay
// 等)会把带 slot 的子元素搬进自己的内部容器(light-DOM slot 路由,见其
// src/slotted-children.ts)。React 卸载组件时按它记录的父节点调用 removeChild,
// 遇到已被搬走的节点会抛 NotFoundError 并卸掉整棵树(表现为白屏)。
// 这里对 removeChild 做最小修补:节点还在 this 的子树内时,按真实父节点执行;
// 其余情况语义不变。
const originalRemoveChild = Element.prototype.removeChild;
Element.prototype.removeChild = function patchedRemoveChild(child) {
    if (child && child.parentNode !== this && this.contains(child)) {
        return originalRemoveChild.call(child.parentNode, child);
    }
    return originalRemoveChild.call(this, child);
};

export function useAdwEvent(ref, event, handler) {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    });

    // 目标元素可能来自条件渲染(如加载完成后才出现的 adw-sidebar),
    // ref 变化不会触发 effect,这里在每次渲染后跟踪 ref.current,
    // 元素真正出现/更换时才挂接监听器。
    const [node, setNode] = useState(null);
    // 有意每次渲染后同步 ref.current → node;ref 赋值不触发渲染,
    // 依赖数组反而会漏掉"条件渲染后元素才出现"的场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const current = ref.current || null;
        if (current !== node) setNode(current);
    });

    useEffect(() => {
        if (!node) return undefined;
        const listener = (e) => handlerRef.current(e);
        node.addEventListener(event, listener);
        return () => node.removeEventListener(event, listener);
    }, [node, event]);
}

// 组件库编译进样式表的符号图标只有约 35 个 GNOME 基础图标,
// 缺的这几个用 16x16 symbolic SVG(currentColor 填充)补齐。
registerIcon('hash', `<svg height="16px" viewBox="0 0 16 16" width="16px" xmlns="http://www.w3.org/2000/svg"><path d="m 6 1 h 2 l -0.75 4 h 2.5 l 0.75 -4 h 2 l -0.75 4 h 2.25 v 2 h -2.625 l -0.5 2.5 h 2.125 v 2 h -2.5 l -0.75 3.5 h -2 l 0.75 -3.5 h -2.5 l -0.75 3.5 h -2 l 0.75 -3.5 h -2.25 v -2 h 2.625 l 0.5 -2.5 h -2.125 v -2 h 2.5 z m 0.875 6 l -0.5 2.5 h 2.5 l 0.5 -2.5 z" fill="currentColor"/></svg>`);

registerIcon('lock', `<svg height="16px" viewBox="0 0 16 16" width="16px" xmlns="http://www.w3.org/2000/svg"><path d="m 8 1 c -1.65625 0 -3 1.34375 -3 3 v 2 h -1 c -0.554688 0 -1 0.445312 -1 1 v 7 c 0 0.554688 0.445312 1 1 1 h 8 c 0.554688 0 1 -0.445312 1 -1 v -7 c 0 -0.554688 -0.445312 -1 -1 -1 h -1 v -2 c 0 -1.65625 -1.34375 -3 -3 -3 z m 0 2 c 0.554688 0 1 0.445312 1 1 v 2 h -2 v -2 c 0 -0.554688 0.445312 -1 1 -1 z m 0 6 c 0.554688 0 1 0.445312 1 1 c 0 0.378906 -0.207031 0.710938 -0.5 0.882812 v 1.117188 h -1 v -1.117188 c -0.292969 -0.171874 -0.5 -0.503906 -0.5 -0.882812 c 0 -0.554688 0.445312 -1 1 -1 z" fill="currentColor"/></svg>`);

registerIcon('logout', `<svg height="16px" viewBox="0 0 16 16" width="16px" xmlns="http://www.w3.org/2000/svg"><path d="m 4 1 c -0.554688 0 -1 0.445312 -1 1 v 12 c 0 0.554688 0.445312 1 1 1 h 3 v -2 h -2 v -10 h 2 v -2 z m 6 2.988281 v 2.011719 h -3 v 2 h 3 v 2.011719 l 4.5 -3.011719 z" fill="currentColor"/></svg>`);
