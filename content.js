// 全局变量
let lastCopyTime = 0;
let processingCopy = false;

// 监听键盘事件，检测Ctrl+C
document.addEventListener('keydown', async (e) => {
  // 检测Ctrl+C (Windows) 或 Cmd+C (Mac)
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    const now = Date.now();
    // 避免重复处理同一次复制
    if (now - lastCopyTime < 200 || processingCopy) return;
    
    lastCopyTime = now;
    
    try {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      // 检查选中内容是否包含图片
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const images = fragment.querySelectorAll('img');
      
      if (images.length === 0) return;

      // 提取需要转换的图片URL
      const imageUrls = Array.from(images)
        .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-original'))
        .filter(src => src && !src.startsWith('data:') && !src.startsWith('blob:'));

      if (imageUrls.length === 0) return;

      console.log('检测到包含图片的复制操作，准备转换...');

      // 延迟处理，让默认复制先完成
      setTimeout(async () => {
        if (processingCopy) return;
        processingCopy = true;
        
        try {
          // 获取图片的data URL
          const response = await chrome.runtime.sendMessage({
            type: 'FETCH_IMAGE_TO_DATAURL',
            urls: imageUrls
          });

          if (response && response.results) {
            // 读取当前剪贴板内容
            let clipboardItems;
            try {
              clipboardItems = await navigator.clipboard.read();
            } catch (err) {
              console.warn('无法读取剪贴板，可能需要用户权限');
              return;
            }

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
              // 解析并替换图片URL
              let modifiedHtml = originalHtml;
              
              // 简单的字符串替换方法，保持原始HTML结构
              imageUrls.forEach(url => {
                const result = response.results[url];
                if (result && result.ok) {
                  // 替换所有出现的这个URL
                  const regex = new RegExp(`src=["']${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g');
                  modifiedHtml = modifiedHtml.replace(regex, `src="${result.dataUrl}"`);
                  
                  // 也处理可能的data-src等属性
                  const dataRegex = new RegExp(`data-src=["']${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g');
                  modifiedHtml = modifiedHtml.replace(dataRegex, `data-src="${result.dataUrl}"`);
                }
              });

              // 重新写入剪贴板
              await navigator.clipboard.write([
                new ClipboardItem({
                  'text/html': new Blob([modifiedHtml], { type: 'text/html' }),
                  'text/plain': new Blob([originalText], { type: 'text/plain' })
                })
              ]);

              console.log('图片转换完成，剪贴板已更新');
            }
          }
        } catch (error) {
          console.warn('图片转换失败:', error);
        } finally {
          processingCopy = false;
        }
      }, 150); // 给默认复制操作足够的时间

    } catch (error) {
      console.warn('复制处理失败:', error);
      processingCopy = false;
    }
  }
}, true);

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
