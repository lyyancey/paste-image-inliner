// 背景脚本具备 host_permissions，可绕过很多 CORS 限制来抓图
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "FETCH_IMAGE_TO_DATAURL" && Array.isArray(msg.urls)) {
    (async () => {
      const results = {};
      for (const url of msg.urls) {
        try {
          // 尝试多种获取方式
          let blob;
          
          // 方法1: 直接fetch
          try {
            const resp = await fetch(url, { 
              credentials: "omit",
              mode: 'cors',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            if (resp.ok) {
              blob = await resp.blob();
            }
          } catch (e) {
            console.warn('Direct fetch failed:', url, e);
          }

          // 方法2: 如果直接fetch失败，尝试通过background script的特权
          if (!blob) {
            try {
              const resp = await fetch(url, { 
                credentials: "include",
                mode: 'no-cors'
              });
              if (resp.ok) {
                blob = await resp.blob();
              }
            } catch (e) {
              console.warn('Background fetch failed:', url, e);
            }
          }

          if (blob && blob.size > 0) {
            // 检查是否为有效图片
            if (blob.type.startsWith('image/') || blob.size > 100) {
              const dataUrl = await blobToDataUrl(blob);
              results[url] = { ok: true, dataUrl };
            } else {
              throw new Error('Invalid image data');
            }
          } else {
            throw new Error('No valid image data received');
          }

        } catch (e) {
          console.warn('Fetch image failed:', url, e);
          results[url] = { ok: false, error: String(e) };
        }
      }
      sendResponse({ results });
    })();
    return true; // 异步响应
  }
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// 安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Paste Image Inliner installed');
});
