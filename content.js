// 全局变量
let lastCopyTime = 0;
let processingCopy = false;
let extensionContextValid = true;

console.log('图片内联转换插件已加载');

// 检测扩展上下文是否有效
function checkExtensionContext() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (e) {
        return false;
    }
}

// 安全的消息发送函数
async function safeRuntimeMessage(message) {
    if (!checkExtensionContext()) {
        console.warn('⚠️ 扩展上下文已失效，请刷新页面');
        throw new Error('Extension context invalidated. Please refresh the page.');
    }
    
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            extensionContextValid = false;
            console.warn('⚠️ 扩展上下文在运行时失效，请刷新页面');
            throw new Error('Extension context invalidated during runtime. Please refresh the page.');
        }
        throw error;
    }
}

// 检测是否在钉钉环境
const isDingTalkEnv = window.location.hostname.includes('dingtalk') || 
                     window.location.hostname.includes('dingding') ||
                     document.querySelector('[data-testid*="dingtalk"]') ||
                     /dingtalk/i.test(navigator.userAgent);

if (isDingTalkEnv) {
    console.log('检测到钉钉环境，启用图片内联转换插件');
}

// 方案1：直接拦截复制事件并完全控制
document.addEventListener('copy', async (e) => {
    // 检查扩展上下文
    if (!extensionContextValid || !checkExtensionContext()) {
        console.warn('⚠️ 扩展上下文无效，使用默认复制行为');
        return; // 让默认复制继续
    }

    try {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        const images = fragment.querySelectorAll('img');
        
        if (images.length === 0) {
            console.log('📋 无图片内容，使用默认复制行为');
            return; // 没有图片，使用默认行为
        }

        // 提取需要转换的图片URL
        const imageUrls = Array.from(images)
            .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-original'))
            .filter(src => src && !src.startsWith('data:') && !src.startsWith('blob:'));

        if (imageUrls.length === 0) {
            console.log('📋 无需转换的图片，使用默认复制行为');
            return; // 没有需要转换的图片
        }

        console.log('🖼️ 发现需要转换的图片:', imageUrls);

        // 阻止默认复制，我们自己处理
        e.preventDefault();

        // 先设置基本的剪贴板内容（作为备份）
        const container = document.createElement('div');
        container.appendChild(fragment.cloneNode(true));
        const fallbackHtml = container.innerHTML;
        const fallbackText = container.textContent || container.innerText || '';

        e.clipboardData.setData('text/html', fallbackHtml);
        e.clipboardData.setData('text/plain', fallbackText);

        console.log('📋 已设置备用剪贴板内容');

        try {
            // 异步获取图片的data URL
            console.log('📡 向background script发送请求...');
            
            // 使用Promise.race来设置超时
            const fetchPromise = safeRuntimeMessage({
                type: 'FETCH_IMAGE_TO_DATAURL',
                urls: imageUrls
            });
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('图片转换超时')), 5000);
            });

            const response = await Promise.race([fetchPromise, timeoutPromise]);

            console.log('📡 收到background script响应:', response);

            if (response && response.results) {
                // 替换图片URL为data URL
                const containerImages = container.querySelectorAll('img');
                let successCount = 0;
                
                containerImages.forEach(img => {
                    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
                    const result = response.results[src];
                    if (result && result.ok) {
                        img.src = result.dataUrl;
                        // 移除可能影响显示的属性
                        img.removeAttribute('data-src');
                        img.removeAttribute('data-original');
                        img.removeAttribute('loading');
                        img.removeAttribute('data-lazy-src');
                        successCount++;
                        console.log('✅ 图片转换成功:', src.substring(0, 50) + '...');
                    } else {
                        console.warn('❌ 图片转换失败:', src, result?.error);
                    }
                });

                if (successCount > 0) {
                    // 获取处理后的HTML
                    const modifiedHtml = container.innerHTML;
                    const textContent = container.textContent || container.innerText || '';

                    console.log('📋 更新剪贴板内容...');
                    console.log('HTML长度:', modifiedHtml.length);
                    console.log('成功转换图片数:', successCount, '/', imageUrls.length);

                    // 使用现代剪贴板API更新内容
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({
                                'text/html': new Blob([modifiedHtml], { type: 'text/html' }),
                                'text/plain': new Blob([textContent], { type: 'text/plain' })
                            })
                        ]);
                        console.log('✅ 剪贴板已更新，包含', successCount, '张内联图片');
                    } catch (clipboardError) {
                        console.warn('❌ 现代剪贴板API失败:', clipboardError);
                        // 如果现代API失败，内容已经通过e.clipboardData设置了
                    }
                } else {
                    console.log('📋 没有图片转换成功，使用原始内容');
                }
            } else {
                console.warn('❌ 未收到有效响应，使用原始内容');
            }
        } catch (error) {
            console.error('❌ 图片转换过程出错:', error.message);
            
            // 如果是扩展上下文问题，给用户提示
            if (error.message.includes('Extension context invalidated')) {
                console.error('🔄 扩展上下文已失效，请刷新页面后重试');
                extensionContextValid = false;
            }
        }

    } catch (error) {
        console.warn('复制事件处理失败:', error);
        // 发生错误时不阻止默认行为，让浏览器正常处理
    }
}, true);

// 方案2：键盘事件后处理（仅在主方案失败时使用）
document.addEventListener('keydown', async (e) => {
    if (!extensionContextValid) return;
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const now = Date.now();
        if (now - lastCopyTime < 500 || processingCopy) return;
        
        lastCopyTime = now;
        
        // 延迟执行，作为备用方案
        setTimeout(async () => {
            if (processingCopy || !checkExtensionContext()) return;
            
            try {
                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                const fragment = range.cloneContents();
                const images = fragment.querySelectorAll('img');
                
                if (images.length === 0) return;

                const imageUrls = Array.from(images)
                    .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-original'))
                    .filter(src => src && !src.startsWith('data:') && !src.startsWith('blob:'));

                if (imageUrls.length === 0) return;

                console.log('🔄 备用方案：异步处理图片转换...');
                processingCopy = true;

                const response = await safeRuntimeMessage({
                    type: 'FETCH_IMAGE_TO_DATAURL',
                    urls: imageUrls
                });

                if (response && response.results) {
                    // 尝试读取并更新剪贴板
                    try {
                        const clipboardItems = await navigator.clipboard.read();
                        let originalHtml = '';
                        let originalText = '';

                        for (const item of clipboardItems) {
                            if (item.types.includes('text/html')) {
                                const htmlBlob = await item.getType('text/html');
                                originalHtml = await htmlBlob.text();
                            }
                            if (item.types.includes('text/plain')) {
                                const textBlob = await item.getType('text/plain');
                                originalText = await textBlob.text();
                            }
                        }

                        if (originalHtml) {
                            let modifiedHtml = originalHtml;
                            let replacedCount = 0;
                            
                            imageUrls.forEach(url => {
                                const result = response.results[url];
                                if (result && result.ok) {
                                    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const srcRegex = new RegExp(`src=["']${escapedUrl}["']`, 'g');
                                    if (srcRegex.test(modifiedHtml)) {
                                        modifiedHtml = modifiedHtml.replace(srcRegex, `src="${result.dataUrl}"`);
                                        replacedCount++;
                                        console.log('🔄 备用方案替换成功:', url.substring(0, 50) + '...');
                                    }
                                }
                            });

                            if (replacedCount > 0) {
                                await navigator.clipboard.write([
                                    new ClipboardItem({
                                        'text/html': new Blob([modifiedHtml], { type: 'text/html' }),
                                        'text/plain': new Blob([originalText], { type: 'text/plain' })
                                    })
                                ]);
                                console.log('✅ 备用方案：剪贴板已更新，替换了', replacedCount, '张图片');
                            }
                        }
                    } catch (clipboardError) {
                        console.warn('🔄 备用方案：剪贴板操作失败:', clipboardError);
                    }
                }
            } catch (error) {
                if (error.message.includes('Extension context invalidated')) {
                    console.warn('🔄 备用方案：扩展上下文失效');
                    extensionContextValid = false;
                } else {
                    console.warn('🔄 备用方案失败:', error);
                }
            } finally {
                processingCopy = false;
            }
        }, 300);
    }
}, false);

// 添加一个简单的测试函数
window.testImageInliner = function() {
    console.log('🧪 测试图片内联功能...');
    
    if (!checkExtensionContext()) {
        console.error('❌ 扩展上下文无效');
        return;
    }
    
    // 创建测试内容
    const testDiv = document.createElement('div');
    testDiv.innerHTML = `
        <p>测试文本</p>
        <img src="https://via.placeholder.com/50x50/ff0000/ffffff?text=TEST" alt="测试图片">
    `;
    
    // 选择测试内容
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(testDiv);
    selection.removeAllRanges();
    selection.addRange(range);
    
    console.log('🧪 已选择测试内容，请按Ctrl+C复制');
    document.body.appendChild(testDiv);
    
    setTimeout(() => {
        testDiv.remove();
    }, 5000);
};

console.log('💡 提示：可以在控制台运行 testImageInliner() 来测试功能');

// 监听扩展上下文失效事件
window.addEventListener('beforeunload', () => {
    extensionContextValid = false;
});

// 定期检查扩展上下文状态
setInterval(() => {
    if (extensionContextValid && !checkExtensionContext()) {
        extensionContextValid = false;
        console.warn('⚠️ 检测到扩展上下文失效');
    }
}, 5000);

// 监听粘贴事件，处理包含图片的HTML
document.addEventListener("paste", async (e) => {
  try {
    // 找到可编辑的容器
    const editable = findEditableHost(e);
    if (!editable) return;

    const html = e.clipboardData?.getData("text/html");
    if (!html) return;

    // 解析HTML，查找图片
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = doc.querySelectorAll('img');
    const imageUrls = Array.from(images)
      .map(img => img.src || img.getAttribute('data-src'))
      .filter(src => src && !src.startsWith('data:') && !src.startsWith('blob:'));

    if (imageUrls.length === 0) return;

    // 阻止默认粘贴
    e.preventDefault();

    // 获取图片的data URL
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_IMAGE_TO_DATAURL',
      urls: imageUrls
    });

    if (response && response.results) {
      // 替换图片URL为data URL
      images.forEach(img => {
        const src = img.src || img.getAttribute('data-src');
        const result = response.results[src];
        if (result && result.ok) {
          img.src = result.dataUrl;
          img.removeAttribute('data-src');
          img.removeAttribute('loading');
        }
      });

      // 插入修改后的HTML
      const modifiedHtml = doc.body.innerHTML;
      insertHtmlAtCursor(modifiedHtml);
    }

  } catch (error) {
    console.warn('Paste image inliner error:', error);
  }
}, true);

function findEditableHost(e) {
  // 从事件路径中找可编辑的元素
  const path = e.composedPath?.() || [];
  const candidate = path.find(n => isEditable(n) && isVisible(n));
  if (candidate) return candidate;

  // 从选区锚点向上查找
  const sel = document.getSelection();
  let node = sel && sel.anchorNode;
  while (node) {
    if (isEditable(node) && isVisible(node)) return node;
    node = node.parentNode;
  }

  // 查找页面上第一个可见的可编辑元素
  return Array.from(document.querySelectorAll('[contenteditable="true"], textarea, input'))
    .find(isVisible);
}

function isEditable(n) {
  return n && (
    n.isContentEditable || 
    ["TEXTAREA", "INPUT"].includes(n.nodeName) ||
    (n.getAttribute && n.getAttribute('contenteditable') === 'true')
  );
}

function isVisible(el) {
  if (!(el instanceof Element)) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function insertHtmlAtCursor(html) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  // 创建文档片段
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;

  // 插入内容
  range.insertNode(fragment);
  
  // 移动光标到插入内容的末尾
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
