// 全局变量跟踪状态
let isProcessing = false;

// 背景脚本具备 host_permissions，可绕过很多 CORS 限制来抓图
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 处理连接测试
  if (msg?.type === "PING") {
    sendResponse({ pong: true, timestamp: Date.now() });
    return true;
  }
  
  if (msg?.type === "FETCH_IMAGE_TO_DATAURL" && Array.isArray(msg.urls)) {
    // 避免重复处理
    if (isProcessing) {
      sendResponse({ 
        error: 'Already processing images', 
        results: {} 
      });
      return true;
    }
    
    isProcessing = true;
    
    (async () => {
      const results = {};
      console.log('Background script: 开始处理', msg.urls.length, '张图片');
      
      try {
        for (const url of msg.urls) {
          try {
            console.log('正在获取图片:', url);
            
            // 尝试多种获取方式
            let blob;
            let finalUrl = url;
            
            // 处理相对URL
            if (url.startsWith('/')) {
              if (sender.tab?.url) {
                const senderUrl = new URL(sender.tab.url);
                finalUrl = `${senderUrl.protocol}//${senderUrl.host}${url}`;
              }
            }
            
            // 方法1: 直接fetch with CORS
            try {
              const resp = await fetch(finalUrl, { 
                credentials: "omit",
                mode: 'cors',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                  'Cache-Control': 'no-cache',
                  'Pragma': 'no-cache'
                }
              });
              
              if (resp.ok && resp.headers.get('content-type')?.startsWith('image/')) {
                blob = await resp.blob();
                console.log('CORS fetch 成功:', url, 'size:', blob.size);
              } else {
                throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
              }
            } catch (corsError) {
              console.warn('CORS fetch 失败:', url, corsError.message);
              
              // 方法2: no-cors模式（作为备用）
              try {
                const resp = await fetch(finalUrl, { 
                  credentials: "omit",
                  mode: 'no-cors',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                });
                
                if (resp.type === 'opaque') {
                  blob = await resp.blob();
                  console.log('No-CORS fetch 成功:', url, 'size:', blob.size);
                } else {
                  throw new Error('No-CORS fetch failed');
                }
              } catch (noCorsError) {
                console.warn('No-CORS fetch 失败:', url, noCorsError.message);
                throw new Error(`所有fetch方法都失败: ${corsError.message}, ${noCorsError.message}`);
              }
            }

            if (blob && blob.size > 0) {
              // 验证blob是否为有效图片
              if (blob.type && blob.type.startsWith('image/')) {
                const dataUrl = await blobToDataUrl(blob);
                results[url] = { 
                  ok: true, 
                  dataUrl,
                  originalSize: blob.size,
                  mimeType: blob.type
                };
                console.log('图片转换成功:', url, 'type:', blob.type, 'size:', blob.size);
              } else if (blob.size > 100) {
                // 即使没有正确的MIME类型，如果文件足够大，也尝试转换
                const dataUrl = await blobToDataUrl(blob);
                results[url] = { 
                  ok: true, 
                  dataUrl,
                  originalSize: blob.size,
                  mimeType: blob.type || 'image/png'
                };
                console.log('图片转换成功（猜测类型）:', url, 'size:', blob.size);
              } else {
                throw new Error('文件太小，可能不是有效图片');
              }
            } else {
              throw new Error('获取到空的响应');
            }

          } catch (e) {
            console.error('获取图片失败:', url, e.message);
            results[url] = { 
              ok: false, 
              error: e.message,
              url: url
            };
          }
        }
        
        const successCount = Object.values(results).filter(r => r.ok).length;
        console.log(`Background script: 处理完成，成功 ${successCount}/${msg.urls.length} 张图片`);
        
        sendResponse({ results });
        
      } catch (globalError) {
        console.error('Background script: 全局错误:', globalError);
        sendResponse({ 
          error: globalError.message, 
          results: results 
        });
      } finally {
        isProcessing = false;
      }
    })();
    
    return true; // 异步响应
  }
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

// 安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Paste Image Inliner 插件已安装');
  isProcessing = false; // 重置状态
});

// 处理插件启动
chrome.runtime.onStartup.addListener(() => {
  console.log('Paste Image Inliner 插件已启动');
  isProcessing = false; // 重置状态
});

// 处理连接断开
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    console.log('Content script 连接断开');
    isProcessing = false; // 重置状态
  });
});

// 监听扩展停止事件
chrome.runtime.onSuspend.addListener(() => {
  console.log('Background script 暂停');
  isProcessing = false;
});
