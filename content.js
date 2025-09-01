// 全局变量
let lastCopyTime = 0;
let processingCopy = false;
let extensionContextValid = true;

// 标题替换配置（默认配置）
let headingReplacementConfig = {
    enabled: false,
    replacements: {
        'h1': 'h2'
    }
};

// 空行清理配置
let emptyLineCleanupConfig = {
    enabled: true,
    removeEmptyParagraphs: true,
    removeEmptyDivs: true,
    removeExcessiveLineBreaks: true,
    compactSpacing: true
};

// 链接处理配置
let linkProcessingConfig = {
    enabled: true,
    removeLinks: true,
    convertToRedText: true,
    redColor: '#ff4d4f' // 默认红色
};

// 页脚过滤配置
let footerFilterConfig = {
    enabled: true,
    removeFooter: true,
    removeCopyright: true,
    customKeywords: ['版权所有', '华为技术有限公司', 'Copyright', '©', '保留所有权利', 'All rights reserved']
};

console.log('图片内联转换插件已加载');

// 检测扩展上下文是否有效
function checkExtensionContext() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (e) {
        return false;
    }
}

// 加载标题替换配置
function loadHeadingConfig() {
    try {
        const saved = localStorage.getItem('imageInliner_headingConfig');
        if (saved) {
            headingReplacementConfig = { ...headingReplacementConfig, ...JSON.parse(saved) };
            console.log('📝 已加载标题替换配置:', headingReplacementConfig);
        }
    } catch (e) {
        console.warn('加载标题配置失败:', e);
    }
}

// 保存标题替换配置
function saveHeadingConfig() {
    try {
        localStorage.setItem('imageInliner_headingConfig', JSON.stringify(headingReplacementConfig));
        console.log('💾 已保存标题替换配置');
    } catch (e) {
        console.warn('保存标题配置失败:', e);
    }
}

// 加载空行清理配置
function loadEmptyLineConfig() {
    try {
        const saved = localStorage.getItem('imageInliner_emptyLineConfig');
        if (saved) {
            emptyLineCleanupConfig = { ...emptyLineCleanupConfig, ...JSON.parse(saved) };
            console.log('🧹 已加载空行清理配置:', emptyLineCleanupConfig);
        }
    } catch (e) {
        console.warn('加载空行清理配置失败:', e);
    }
}

// 保存空行清理配置
function saveEmptyLineConfig() {
    try {
        localStorage.setItem('imageInliner_emptyLineConfig', JSON.stringify(emptyLineCleanupConfig));
        console.log('💾 已保存空行清理配置');
    } catch (e) {
        console.warn('保存空行清理配置失败:', e);
    }
}

// 加载链接处理配置
function loadLinkProcessingConfig() {
    try {
        const saved = localStorage.getItem('imageInliner_linkProcessingConfig');
        if (saved) {
            linkProcessingConfig = { ...linkProcessingConfig, ...JSON.parse(saved) };
            console.log('🔗 已加载链接处理配置:', linkProcessingConfig);
        }
    } catch (e) {
        console.warn('加载链接处理配置失败:', e);
    }
}

// 保存链接处理配置
function saveLinkProcessingConfig() {
    try {
        localStorage.setItem('imageInliner_linkProcessingConfig', JSON.stringify(linkProcessingConfig));
        console.log('💾 已保存链接处理配置');
    } catch (e) {
        console.warn('保存链接处理配置失败:', e);
    }
}

// 加载页脚过滤配置
function loadFooterFilterConfig() {
    try {
        const saved = localStorage.getItem('imageInliner_footerFilterConfig');
        if (saved) {
            footerFilterConfig = { ...footerFilterConfig, ...JSON.parse(saved) };
            console.log('🦶 已加载页脚过滤配置:', footerFilterConfig);
        }
    } catch (e) {
        console.warn('加载页脚过滤配置失败:', e);
    }
}

// 保存页脚过滤配置
function saveFooterFilterConfig() {
    try {
        localStorage.setItem('imageInliner_footerFilterConfig', JSON.stringify(footerFilterConfig));
        console.log('💾 已保存页脚过滤配置');
    } catch (e) {
        console.warn('保存页脚过滤配置失败:', e);
    }
}

// 应用页脚过滤
function applyFooterFilter(container) {
    if (!footerFilterConfig.enabled) {
        console.log('🦶 页脚过滤功能未启用');
        return 0;
    }
    
    let filteredCount = 0;
    
    if (footerFilterConfig.removeFooter || footerFilterConfig.removeCopyright) {
        // 查找页脚相关元素
        const footerSelectors = [
            'footer', 
            '[class*="footer"]', 
            '[id*="footer"]',
            '[class*="copyright"]', 
            '[id*="copyright"]',
            '.page-footer',
            '.site-footer',
            '.main-footer'
        ];
        
        footerSelectors.forEach(selector => {
            const elements = container.querySelectorAll(selector);
            elements.forEach(element => {
                const text = element.textContent.trim();
                if (shouldRemoveFooterElement(text)) {
                    element.remove();
                    filteredCount++;
                    console.log(`🦶 移除页脚元素: ${text.substring(0, 50)}...`);
                }
            });
        });
        
        // 检查所有元素的文本内容
        const allElements = container.querySelectorAll('*');
        allElements.forEach(element => {
            // 只检查叶子节点（没有子元素的元素）
            if (element.children.length === 0) {
                const text = element.textContent.trim();
                if (text && shouldRemoveFooterElement(text)) {
                    // 检查父元素是否包含其他重要内容
                    const parent = element.parentElement;
                    if (parent && parent.children.length === 1) {
                        // 如果父元素只包含这一个子元素，移除父元素
                        parent.remove();
                    } else {
                        // 否则只移除当前元素
                        element.remove();
                    }
                    filteredCount++;
                    console.log(`🦶 移除版权文字: ${text.substring(0, 50)}...`);
                }
            }
        });
    }
    
    if (filteredCount > 0) {
        console.log(`✅ 完成页脚过滤，共移除 ${filteredCount} 个元素`);
    }
    
    return filteredCount;
}

// 判断是否应该移除页脚元素
function shouldRemoveFooterElement(text) {
    if (!text || text.length < 3) return false;
    
    const keywords = footerFilterConfig.customKeywords;
    const lowerText = text.toLowerCase();
    
    // 检查是否包含版权相关关键词
    const copyrightKeywords = ['版权所有', 'copyright', '©', '保留所有权利', 'all rights reserved'];
    const hasCopyright = copyrightKeywords.some(keyword => 
        lowerText.includes(keyword.toLowerCase())
    );
    
    if (hasCopyright) {
        // 进一步检查是否包含公司名称或其他关键词
        const hasKeyword = keywords.some(keyword => 
            lowerText.includes(keyword.toLowerCase())
        );
        
        if (hasKeyword) {
            return true;
        }
    }
    
    // 检查是否是纯粹的版权声明（较短且只包含版权信息）
    if (text.length < 100 && hasCopyright) {
        return true;
    }
    
    return false;
}

// 应用链接处理
function applyLinkProcessing(container) {
    if (!linkProcessingConfig.enabled) {
        console.log('🔗 链接处理功能未启用');
        return 0;
    }
    
    let processedCount = 0;
    
    if (linkProcessingConfig.removeLinks) {
        const links = container.querySelectorAll('a');
        
        links.forEach(link => {
            if (linkProcessingConfig.convertToRedText) {
                // 创建一个span元素替换链接
                const span = document.createElement('span');
                
                // 复制链接的文本内容
                span.textContent = link.textContent;
                
                // 设置红色样式
                span.style.color = linkProcessingConfig.redColor;
                span.style.fontWeight = 'bold'; // 可选：加粗以突出显示
                
                // 保持原有的其他样式（如果有的话）
                const computedStyle = window.getComputedStyle(link);
                if (computedStyle.fontSize && computedStyle.fontSize !== '16px') {
                    span.style.fontSize = computedStyle.fontSize;
                }
                if (computedStyle.fontFamily && computedStyle.fontFamily !== 'serif') {
                    span.style.fontFamily = computedStyle.fontFamily;
                }
                
                // 替换链接元素
                link.parentNode.replaceChild(span, link);
                processedCount++;
                
                console.log(`🔗 链接转红字: ${span.textContent.substring(0, 30)}...`);
            } else {
                // 只移除链接，保留文本
                const textNode = document.createTextNode(link.textContent);
                link.parentNode.replaceChild(textNode, link);
                processedCount++;
                
                console.log(`🔗 移除链接: ${link.textContent.substring(0, 30)}...`);
            }
        });
    }
    
    if (processedCount > 0) {
        console.log(`✅ 完成链接处理，共处理 ${processedCount} 个链接`);
    }
    
    return processedCount;
}

// 应用空行清理
function applyEmptyLineCleanup(container) {
    if (!emptyLineCleanupConfig.enabled) {
        console.log('🧹 空行清理功能未启用');
        return 0;
    }
    
    let cleanupCount = 0;
    
    // 1. 移除空的段落和div
    if (emptyLineCleanupConfig.removeEmptyParagraphs || emptyLineCleanupConfig.removeEmptyDivs) {
        const emptySelectors = [];
        if (emptyLineCleanupConfig.removeEmptyParagraphs) {
            emptySelectors.push('p');
        }
        if (emptyLineCleanupConfig.removeEmptyDivs) {
            emptySelectors.push('div');
        }
        
        emptySelectors.forEach(selector => {
            const elements = container.querySelectorAll(selector);
            elements.forEach(element => {
                const text = element.textContent.trim();
                const hasImages = element.querySelector('img');
                const hasOtherContent = element.querySelector('table, ul, ol, blockquote, hr');
                
                // 只删除真正空的元素（没有文字、图片或其他重要内容）
                if (!text && !hasImages && !hasOtherContent) {
                    element.remove();
                    cleanupCount++;
                    console.log(`🧹 移除空的 ${selector.toUpperCase()} 元素`);
                }
            });
        });
    }
    
    // 2. 移除多余的换行符
    if (emptyLineCleanupConfig.removeExcessiveLineBreaks) {
        const brElements = container.querySelectorAll('br');
        brElements.forEach((br, index) => {
            const nextElement = br.nextElementSibling;
            const nextBr = nextElement && nextElement.tagName === 'BR' ? nextElement : null;
            
            // 如果连续有多个<br>，只保留一个
            if (nextBr) {
                let consecutiveBrCount = 0;
                let currentElement = br;
                
                while (currentElement && currentElement.tagName === 'BR') {
                    consecutiveBrCount++;
                    currentElement = currentElement.nextElementSibling;
                }
                
                // 如果有超过2个连续的<br>，移除多余的
                if (consecutiveBrCount > 2) {
                    let removeCount = consecutiveBrCount - 2;
                    let elementToRemove = br.nextElementSibling;
                    
                    while (removeCount > 0 && elementToRemove && elementToRemove.tagName === 'BR') {
                        const nextToRemove = elementToRemove.nextElementSibling;
                        elementToRemove.remove();
                        elementToRemove = nextToRemove;
                        removeCount--;
                        cleanupCount++;
                    }
                    
                    console.log(`🧹 移除了 ${consecutiveBrCount - 2} 个多余的换行符`);
                }
            }
        });
    }
    
    // 3. 紧凑间距（减少过大的边距）
    if (emptyLineCleanupConfig.compactSpacing) {
        const elementsWithMargin = container.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, ul, ol, blockquote');
        elementsWithMargin.forEach(element => {
            const style = element.style;
            const computedStyle = window.getComputedStyle ? window.getComputedStyle(element) : null;
            
            // 检查是否有过大的边距
            if (computedStyle) {
                const marginTop = parseFloat(computedStyle.marginTop);
                const marginBottom = parseFloat(computedStyle.marginBottom);
                
                // 如果上下边距过大（超过2em），减少到合理范围
                if (marginTop > 32) { // 32px 约等于 2em
                    element.style.marginTop = '1em';
                    cleanupCount++;
                }
                if (marginBottom > 32) {
                    element.style.marginBottom = '1em';
                    cleanupCount++;
                }
            }
            
            // 直接检查内联样式
            if (style.marginTop && parseFloat(style.marginTop) > 32) {
                style.marginTop = '1em';
                cleanupCount++;
            }
            if (style.marginBottom && parseFloat(style.marginBottom) > 32) {
                style.marginBottom = '1em';
                cleanupCount++;
            }
        });
    }
    
    if (cleanupCount > 0) {
        console.log(`✅ 完成空行清理，共处理 ${cleanupCount} 个元素`);
    }
    
    return cleanupCount;
}

// 应用标题替换
function applyHeadingReplacements(container) {
    if (!headingReplacementConfig.enabled) {
        console.log('📝 标题替换功能未启用');
        return 0;
    }
    
    let replacementCount = 0;
    const replacements = headingReplacementConfig.replacements;
    
    // 收集所有需要替换的标题元素及其替换目标
    const elementsToReplace = [];
    
    // 查找所有标题元素并记录原始标签和目标标签
    for (const [fromTag, toTag] of Object.entries(replacements)) {
        if (fromTag === toTag) continue; // 跳过相同的标签
        
        const headings = container.querySelectorAll(fromTag);
        headings.forEach(heading => {
            if (toTag && toTag !== fromTag) {
                elementsToReplace.push({
                    element: heading,
                    fromTag: fromTag,
                    toTag: toTag
                });
            }
        });
    }
    
    // 执行替换（一次性替换，避免重复处理）
    elementsToReplace.forEach(({ element, fromTag, toTag }) => {
        // 创建新的标题元素
        const newHeading = document.createElement(toTag);
        
        // 复制所有属性
        Array.from(element.attributes).forEach(attr => {
            newHeading.setAttribute(attr.name, attr.value);
        });
        
        // 复制内容
        newHeading.innerHTML = element.innerHTML;
        
        // 替换元素
        element.parentNode.replaceChild(newHeading, element);
        replacementCount++;
        
        console.log(`📝 ${fromTag.toUpperCase()} -> ${toTag.toUpperCase()}: ${newHeading.textContent.substring(0, 30)}...`);
    });
    
    if (replacementCount > 0) {
        console.log(`✅ 完成标题替换，共替换 ${replacementCount} 个标题`);
    }
    
    return replacementCount;
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

// 显示标题替换配置界面
function showHeadingConfigUI() {
    // 移除已存在的配置界面
    const existingUI = document.getElementById('headingConfigUI');
    if (existingUI) {
        existingUI.remove();
    }
    
    // 创建配置界面
    const configUI = document.createElement('div');
    configUI.id = 'headingConfigUI';
    configUI.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; background: white; border: 2px solid #1890ff; border-radius: 8px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10000; font-family: Arial, sans-serif; max-width: 400px; max-height: 80vh; overflow-y: auto;">
            <h3 style="margin: 0 0 15px 0; color: #1890ff; font-size: 16px;">🔧 内容处理设置</h3>
            
            <!-- 标题替换设置 -->
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">📝 标题替换</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enableHeadingReplacement" ${headingReplacementConfig.enabled ? 'checked' : ''} style="margin-right: 8px;">
                        <span style="font-weight: bold;">启用标题替换功能</span>
                    </label>
                </div>
                
                <div id="replacementRules" style="display: ${headingReplacementConfig.enabled ? 'block' : 'none'};">
                    <div style="margin-bottom: 10px; font-weight: bold; color: #666;">替换规则：</div>
                    ${generateReplacementInputs()}
                </div>
            </div>
            
            <!-- 空行清理设置 -->
            <div style="margin-bottom: 20px; padding: 15px; background: #f0f8ff; border-radius: 6px;">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">🧹 空行清理</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enableEmptyLineCleanup" ${emptyLineCleanupConfig.enabled ? 'checked' : ''} style="margin-right: 8px;">
                        <span style="font-weight: bold;">启用空行清理功能</span>
                    </label>
                </div>
                
                <div id="cleanupOptions" style="display: ${emptyLineCleanupConfig.enabled ? 'block' : 'none'};">
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="removeEmptyParagraphs" ${emptyLineCleanupConfig.removeEmptyParagraphs ? 'checked' : ''} style="margin-right: 8px;">
                            <span>移除空段落</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="removeEmptyDivs" ${emptyLineCleanupConfig.removeEmptyDivs ? 'checked' : ''} style="margin-right: 8px;">
                            <span>移除空的div元素</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="removeExcessiveLineBreaks" ${emptyLineCleanupConfig.removeExcessiveLineBreaks ? 'checked' : ''} style="margin-right: 8px;">
                            <span>移除多余换行符</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="compactSpacing" ${emptyLineCleanupConfig.compactSpacing ? 'checked' : ''} style="margin-right: 8px;">
                            <span>紧凑间距</span>
                        </label>
                    </div>
                </div>
            </div>
            
            <!-- 链接处理设置 -->
            <div style="margin-bottom: 20px; padding: 15px; background: #fff7e6; border-radius: 6px;">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">🔗 链接处理</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enableLinkProcessing" ${linkProcessingConfig.enabled ? 'checked' : ''} style="margin-right: 8px;">
                        <span style="font-weight: bold;">启用链接处理功能</span>
                    </label>
                </div>
                
                <div id="linkProcessingOptions" style="display: ${linkProcessingConfig.enabled ? 'block' : 'none'};">
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="removeLinks" ${linkProcessingConfig.removeLinks ? 'checked' : ''} style="margin-right: 8px;">
                            <span>移除链接</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="convertToRedText" ${linkProcessingConfig.convertToRedText ? 'checked' : ''} style="margin-right: 8px;">
                            <span>转换为红色文字</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <span style="margin-right: 8px;">红色值:</span>
                            <input type="color" id="redColorPicker" value="${linkProcessingConfig.redColor}" style="width: 50px; height: 25px; border: none; border-radius: 3px; cursor: pointer;">
                            <input type="text" id="redColorText" value="${linkProcessingConfig.redColor}" style="margin-left: 8px; width: 80px; font-size: 12px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px;">
                        </label>
                    </div>
                </div>
            </div>
            
            <!-- 页脚过滤设置 -->
            <div style="margin-bottom: 20px; padding: 15px; background: #f9f0ff; border-radius: 6px;">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">🦶 页脚过滤</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enableFooterFilter" ${footerFilterConfig.enabled ? 'checked' : ''} style="margin-right: 8px;">
                        <span style="font-weight: bold;">启用页脚过滤功能</span>
                    </label>
                </div>
                
                <div id="footerFilterOptions" style="display: ${footerFilterConfig.enabled ? 'block' : 'none'};">
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="removeFooter" ${footerFilterConfig.removeFooter ? 'checked' : ''} style="margin-right: 8px;">
                            <span>移除页脚元素</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" id="removeCopyright" ${footerFilterConfig.removeCopyright ? 'checked' : ''} style="margin-right: 8px;">
                            <span>移除版权信息</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
                        <div>默认过滤关键词：版权所有、华为技术有限公司、Copyright、©</div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button id="saveAllConfig" style="background: #52c41a; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; flex: 1;">保存</button>
                <button id="resetAllConfig" style="background: #fa8c16; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; flex: 1;">重置</button>
                <button id="closeConfig" style="background: #f5f5f5; color: #333; border: 1px solid #d9d9d9; padding: 8px 16px; border-radius: 4px; cursor: pointer;">关闭</button>
            </div>
            
            <div style="margin-top: 10px; font-size: 12px; color: #666;">
                <div>💡 提示：</div>
                <div>• 标题替换：将 H1, H2 改为 H3 等</div>
                <div>• 链接处理：移除链接并转为红色文字</div>
                <div>• 页脚过滤：移除版权信息和页脚内容</div>
                <div>• 空行清理：移除多余的空行和间距</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(configUI);
    
    // 绑定事件
    document.getElementById('enableHeadingReplacement').addEventListener('change', function() {
        const rulesDiv = document.getElementById('replacementRules');
        rulesDiv.style.display = this.checked ? 'block' : 'none';
    });
    
    document.getElementById('enableEmptyLineCleanup').addEventListener('change', function() {
        const optionsDiv = document.getElementById('cleanupOptions');
        optionsDiv.style.display = this.checked ? 'block' : 'none';
    });
    
    document.getElementById('enableLinkProcessing').addEventListener('change', function() {
        const optionsDiv = document.getElementById('linkProcessingOptions');
        optionsDiv.style.display = this.checked ? 'block' : 'none';
    });
    
    document.getElementById('enableFooterFilter').addEventListener('change', function() {
        const optionsDiv = document.getElementById('footerFilterOptions');
        optionsDiv.style.display = this.checked ? 'block' : 'none';
    });
    
    // 颜色选择器和文本框联动
    document.getElementById('redColorPicker').addEventListener('change', function() {
        document.getElementById('redColorText').value = this.value;
    });
    
    document.getElementById('redColorText').addEventListener('change', function() {
        const color = this.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            document.getElementById('redColorPicker').value = color;
        }
    });
    
    document.getElementById('saveAllConfig').addEventListener('click', saveAllConfigFromUI);
    document.getElementById('resetAllConfig').addEventListener('click', resetAllConfigUI);
    document.getElementById('closeConfig').addEventListener('click', () => configUI.remove());
    
    // 绑定替换规则的change事件
    document.querySelectorAll('.replacement-select').forEach(select => {
        select.addEventListener('change', updateConfigFromUI);
    });
}

function generateReplacementInputs() {
    const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    let html = '';
    
    headingLevels.forEach(level => {
        const currentValue = headingReplacementConfig.replacements[level] || level;
        html += `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="width: 40px; font-weight: bold; text-transform: uppercase;">${level}:</span>
                <select class="replacement-select" data-from="${level}" style="flex: 1; padding: 4px; border: 1px solid #d9d9d9; border-radius: 4px;">
                    ${headingLevels.map(h => `<option value="${h}" ${h === currentValue ? 'selected' : ''}>${h.toUpperCase()}</option>`).join('')}
                </select>
            </div>
        `;
    });
    
    return html;
}

function updateConfigFromUI() {
    document.querySelectorAll('.replacement-select').forEach(select => {
        const fromTag = select.dataset.from;
        const toTag = select.value;
        headingReplacementConfig.replacements[fromTag] = toTag;
    });
}

function saveConfigFromUI() {
    headingReplacementConfig.enabled = document.getElementById('enableHeadingReplacement').checked;
    updateConfigFromUI();
    saveHeadingConfig();
    
    // 显示保存成功提示
    const button = document.getElementById('saveHeadingConfig');
    const originalText = button.textContent;
    button.textContent = '✅ 已保存';
    button.style.background = '#52c41a';
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '#52c41a';
    }, 1000);
    
    console.log('✅ 标题替换配置已保存:', headingReplacementConfig);
}

function resetConfigUI() {
    headingReplacementConfig = {
        enabled: false,
        replacements: {
            'h1': 'h3',
            'h2': 'h3',
            'h3': 'h3',
            'h4': 'h4',
            'h5': 'h5',
            'h6': 'h6'
        }
    };
    
    document.getElementById('enableHeadingReplacement').checked = false;
    document.getElementById('replacementRules').style.display = 'none';
    
    document.querySelectorAll('.replacement-select').forEach(select => {
        const fromTag = select.dataset.from;
        select.value = headingReplacementConfig.replacements[fromTag];
    });
    
    // 重置页脚过滤配置
    footerFilterConfig = {
        enabled: true,
        keywords: ['版权所有', '华为技术有限公司', 'Copyright', '© 华为', '备案号', 'ICP']
    };
    saveFooterFilterConfig();
    updateFooterFilterUI();
    
    console.log('🔄 标题替换配置已重置');
}

// 更新空行清理配置
function updateEmptyLineConfigFromUI() {
    emptyLineCleanupConfig.enabled = document.getElementById('enableEmptyLineCleanup').checked;
    emptyLineCleanupConfig.removeEmptyParagraphs = document.getElementById('removeEmptyParagraphs').checked;
    emptyLineCleanupConfig.removeEmptyDivs = document.getElementById('removeEmptyDivs').checked;
    emptyLineCleanupConfig.removeExcessiveLineBreaks = document.getElementById('removeExcessiveLineBreaks').checked;
    emptyLineCleanupConfig.compactSpacing = document.getElementById('compactSpacing').checked;
}

// 更新链接处理配置
function updateLinkProcessingConfigFromUI() {
    linkProcessingConfig.enabled = document.getElementById('enableLinkProcessing').checked;
    linkProcessingConfig.removeLinks = document.getElementById('removeLinks').checked;
    linkProcessingConfig.convertToRedText = document.getElementById('convertToRedText').checked;
    linkProcessingConfig.redColor = document.getElementById('redColorText').value;
}

// 更新页脚过滤配置
function updateFooterFilterConfigFromUI() {
    footerFilterConfig.enabled = document.getElementById('enableFooterFilter').checked;
    footerFilterConfig.removeFooter = document.getElementById('removeFooter').checked;
    footerFilterConfig.removeCopyright = document.getElementById('removeCopyright').checked;
}

// 保存所有配置
function saveAllConfigFromUI() {
    // 更新标题替换配置
    headingReplacementConfig.enabled = document.getElementById('enableHeadingReplacement').checked;
    updateConfigFromUI();
    saveHeadingConfig();
    
    // 更新空行清理配置
    updateEmptyLineConfigFromUI();
    saveEmptyLineConfig();
    
    // 更新链接处理配置
    updateLinkProcessingConfigFromUI();
    saveLinkProcessingConfig();
    
    // 更新页脚过滤配置
    updateFooterFilterConfigFromUI();
    saveFooterFilterConfig();
    
    // 显示保存成功提示
    const button = document.getElementById('saveAllConfig');
    if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ 已保存';
        button.style.background = '#52c41a';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#52c41a';
        }, 1000);
    }
    
    console.log('✅ 所有配置已保存');
    console.log('标题替换配置:', headingReplacementConfig);
    console.log('空行清理配置:', emptyLineCleanupConfig);
}

// 重置所有配置
function resetAllConfigUI() {
    // 重置标题替换配置
    headingReplacementConfig = {
        enabled: false,
        replacements: {
            'h1': 'h3',
            'h2': 'h3',
            'h3': 'h3',
            'h4': 'h4',
            'h5': 'h5',
            'h6': 'h6'
        }
    };
    
    // 重置空行清理配置
    emptyLineCleanupConfig = {
        enabled: true,
        removeEmptyParagraphs: true,
        removeEmptyDivs: true,
        removeExcessiveLineBreaks: true,
        compactSpacing: true
    };
    
    // 重置链接处理配置
    linkProcessingConfig = {
        enabled: true,
        removeLinks: true,
        convertToRedText: true,
        redColor: '#ff4d4f'
    };
    
    // 更新界面
    document.getElementById('enableHeadingReplacement').checked = false;
    document.getElementById('replacementRules').style.display = 'none';
    
    document.getElementById('enableEmptyLineCleanup').checked = true;
    document.getElementById('cleanupOptions').style.display = 'block';
    document.getElementById('removeEmptyParagraphs').checked = true;
    document.getElementById('removeEmptyDivs').checked = true;
    document.getElementById('removeExcessiveLineBreaks').checked = true;
    document.getElementById('compactSpacing').checked = true;
    
    document.getElementById('enableLinkProcessing').checked = true;
    document.getElementById('linkProcessingOptions').style.display = 'block';
    document.getElementById('removeLinks').checked = true;
    document.getElementById('convertToRedText').checked = true;
    document.getElementById('redColorText').value = '#ff4d4f';
    document.getElementById('redColorPicker').value = '#ff4d4f';
    
    document.querySelectorAll('.replacement-select').forEach(select => {
        const fromTag = select.dataset.from;
        select.value = headingReplacementConfig.replacements[fromTag];
    });
    
    console.log('🔄 所有配置已重置');
}

// 检测是否在钉钉环境
const isDingTalkEnv = window.location.hostname.includes('dingtalk') || 
                     window.location.hostname.includes('dingding') ||
                     document.querySelector('[data-testid*="dingtalk"]') ||
                     /dingtalk/i.test(navigator.userAgent);

if (isDingTalkEnv) {
    console.log('检测到钉钉环境，启用图片内联转换插件');
}

// 加载配置
loadHeadingConfig();
loadEmptyLineConfig();
loadLinkProcessingConfig();
loadFooterFilterConfig();

// 添加快捷键监听 (Ctrl+Shift+H 打开标题配置)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        showHeadingConfigUI();
        console.log('🔧 打开标题替换配置界面');
    }
}, false);

// 在页面中添加一个小的配置按钮（可选）
function addConfigButton() {
    // 避免重复添加
    if (document.getElementById('imageInlinerConfigBtn')) return;
    
    const configBtn = document.createElement('div');
    configBtn.id = 'imageInlinerConfigBtn';
    configBtn.setAttribute('data-image-inliner-config', 'true');
    configBtn.innerHTML = '🔧';
    configBtn.title = '图片内联插件设置 (Ctrl+Shift+H)';
    configBtn.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 40px;
        height: 40px;
        background: #1890ff;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 18px;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        pointer-events: auto;
    `;
    
    configBtn.addEventListener('mouseenter', () => {
        configBtn.style.transform = 'scale(1.1)';
        configBtn.style.background = '#40a9ff';
    });
    
    configBtn.addEventListener('mouseleave', () => {
        configBtn.style.transform = 'scale(1)';
        configBtn.style.background = '#1890ff';
    });
    
    configBtn.addEventListener('click', () => {
        showHeadingConfigUI();
    });
    
    document.body.appendChild(configBtn);
}

// 在页面加载完成后添加配置按钮
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addConfigButton);
} else {
    addConfigButton();
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

        // 先检查选中内容，确保表格完整性
        const range = selection.getRangeAt(0);
        let adjustedRange = range.cloneRange();
        let needsAdjustment = false;
        
        // 检查是否选择了整个文档（Ctrl+A），如果是，需要排除插件添加的元素
        let isSelectAll = false;
        if (range.startContainer === document.documentElement || 
            range.startContainer === document.body ||
            (range.startContainer.nodeType === Node.ELEMENT_NODE && 
             range.startOffset === 0 && 
             range.endOffset === range.endContainer.childNodes.length)) {
            isSelectAll = true;
            console.log('🔍 检测到全选操作，将排除插件添加的元素');
        }
        
        // 检查选中范围是否包含不完整的表格
        const fragment = range.cloneContents();
        const partialTables = fragment.querySelectorAll('table');
        
        if (partialTables.length > 0) {
            console.log('🔍 检测到表格，检查是否需要调整选中范围...');
            
            // 找到完整的表格并调整选中范围
            const commonAncestor = range.commonAncestorContainer;
            const allTablesInRange = commonAncestor.nodeType === Node.ELEMENT_NODE ? 
                commonAncestor.querySelectorAll('table') : 
                (commonAncestor.parentElement ? commonAncestor.parentElement.querySelectorAll('table') : []);
            
            for (const table of allTablesInRange) {
                if (range.intersectsNode(table)) {
                    // 检查表格的caption是否在选中范围内
                    const caption = table.querySelector('caption');
                    if (caption && !range.intersectsNode(caption)) {
                        console.log('📋 调整选中范围以包含表格标题');
                        adjustedRange.setStartBefore(table);
                        if (range.endContainer === table || table.contains(range.endContainer)) {
                            adjustedRange.setEndAfter(table);
                        }
                        needsAdjustment = true;
                    }
                }
            }
        }
        
        // 使用调整后的范围
        const finalFragment = adjustedRange.cloneContents();
        const images = finalFragment.querySelectorAll('img');
        
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

        // 获取完整的HTML内容，保持所有格式和样式
        const originalRange = needsAdjustment ? adjustedRange : selection.getRangeAt(0);
        let fullHtml = '';
        let plainText = '';
        
        console.log('📋 使用', needsAdjustment ? '调整后的' : '原始的', '选中范围进行复制');
        
        // 方法1：使用 Range.toString() 和更精确的HTML提取
        try {
            // 获取选中内容的HTML，保持原始结构
            if (typeof originalRange.getClientRects === 'function' && originalRange.getClientRects().length > 0) {
                // 创建临时容器
                const tempContainer = document.createElement('div');
                
                // 克隆选中的内容，包括所有子节点
                const clonedContents = originalRange.cloneContents();
                tempContainer.appendChild(clonedContents);
                
                // 如果是全选操作，移除插件添加的元素
                if (isSelectAll) {
                    console.log('🧹 清理插件添加的元素...');
                    
                    // 移除配置按钮
                    const configButtons = tempContainer.querySelectorAll('[id="imageInlinerConfigBtn"], [data-image-inliner-config]');
                    configButtons.forEach(btn => {
                        btn.remove();
                        console.log('🗑️ 移除配置按钮');
                    });
                    
                    // 移除测试内容
                    const testElements = tempContainer.querySelectorAll('[data-image-inliner-test="true"]');
                    testElements.forEach(elem => {
                        elem.remove();
                        console.log('🗑️ 移除测试内容');
                    });
                    
                    // 移除配置界面
                    const configUIs = tempContainer.querySelectorAll('[id="headingConfigUI"]');
                    configUIs.forEach(ui => {
                        ui.remove();
                        console.log('🗑️ 移除配置界面');
                    });
                    
                    // 移除任何包含插件相关文字的元素
                    const allElements = tempContainer.querySelectorAll('*');
                    allElements.forEach(elem => {
                        const text = elem.textContent;
                        if (text && (
                            text.includes('图片内联转换插件') ||
                            text.includes('🔧 内容处理设置') ||
                            text.includes('testImageInliner') ||
                            text.includes('imageInlinerConfig')
                        )) {
                            elem.remove();
                            console.log('🗑️ 移除插件相关文字:', text.substring(0, 30) + '...');
                        }
                    });
                }
                
                // 特殊处理：将表格标题转换为表格上方的独立文字
                console.log('🔍 开始处理表格标题转换...');
                
                // 获取选中范围内的所有表格
                const tables = tempContainer.querySelectorAll('table');
                console.log('找到', tables.length, '个表格');
                
                // 获取原始选中范围，检查是否包含完整的表格
                const startContainer = originalRange.startContainer;
                const endContainer = originalRange.endContainer;
                const commonAncestor = originalRange.commonAncestorContainer;
                
                // 查找选中范围内或相关的所有表格
                let relevantTables = [];
                if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
                    relevantTables = Array.from(commonAncestor.querySelectorAll('table'));
                } else if (commonAncestor.parentElement) {
                    relevantTables = Array.from(commonAncestor.parentElement.querySelectorAll('table'));
                }
                
                console.log('相关表格数量:', relevantTables.length);
                
                tables.forEach((clonedTable, index) => {
                    try {
                        console.log(`处理表格 ${index + 1}...`);
                        
                        // 更精确的表格匹配方法
                        let originalTable = null;
                        
                        // 方法1：在相关表格中查找匹配的表格
                        const clonedFirstCell = clonedTable.querySelector('td, th');
                        const clonedFirstCellText = clonedFirstCell ? clonedFirstCell.textContent.trim() : '';
                        
                        for (const table of relevantTables) {
                            const originalFirstCell = table.querySelector('td, th');
                            const originalFirstCellText = originalFirstCell ? originalFirstCell.textContent.trim() : '';
                            
                            if (clonedFirstCellText && originalFirstCellText && 
                                clonedFirstCellText === originalFirstCellText) {
                                originalTable = table;
                                console.log('✅ 通过首个单元格内容匹配到表格');
                                break;
                            }
                        }
                        
                        // 方法2：如果没有匹配成功，尝试通过表格结构匹配
                        if (!originalTable && relevantTables[index]) {
                            originalTable = relevantTables[index];
                            console.log('✅ 通过索引匹配到表格');
                        }
                        
                        // 方法3：如果还是没有匹配，尝试通过位置匹配
                        if (!originalTable) {
                            for (const table of relevantTables) {
                                if (originalRange.intersectsNode(table)) {
                                    originalTable = table;
                                    console.log('✅ 通过范围交集匹配到表格');
                                    break;
                                }
                            }
                        }
                        
                        if (originalTable) {
                            const originalCaption = originalTable.querySelector('caption');
                            const clonedCaption = clonedTable.querySelector('caption');
                            
                            console.log('原始表格有标题:', !!originalCaption);
                            console.log('克隆表格有标题:', !!clonedCaption);
                            
                            // 处理表格标题：将caption转换为表格上方的独立文字
                            let captionElement = clonedCaption || originalCaption;
                            
                            if (captionElement) {
                                console.log('📝 将caption转换为独立文字元素');
                                
                                // 创建一个div元素来替代caption
                                const captionDiv = document.createElement('div');
                                
                                // 复制caption的所有内容和属性
                                captionDiv.innerHTML = captionElement.innerHTML;
                                captionDiv.textContent = captionElement.textContent;
                                
                                // 获取并应用caption的计算样式
                                if (originalCaption) {
                                    const computedStyle = window.getComputedStyle(originalCaption);
                                    
                                    // 重要的样式属性
                                    const captionStyles = [
                                        'color', 'background-color', 'background', 'font-size', 'font-weight', 
                                        'font-family', 'font-style', 'text-decoration', 'text-align', 
                                        'line-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 
                                        'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 
                                        'padding-left', 'border', 'border-color', 'border-style', 'border-width',
                                        'border-radius', 'display', 'width', 'max-width', 'text-transform', 
                                        'letter-spacing', 'word-spacing', 'white-space', 'opacity', 
                                        'box-shadow', 'text-shadow'
                                    ];
                                    
                                    let styleString = '';
                                    captionStyles.forEach(property => {
                                        const value = computedStyle.getPropertyValue(property);
                                        if (value && 
                                            value !== 'initial' && 
                                            value !== 'normal' && 
                                            value !== 'none' && 
                                            value !== 'auto' &&
                                            value !== 'rgba(0, 0, 0, 0)' &&
                                            value !== 'transparent') {
                                            
                                            // 特殊处理一些默认值
                                            if (property === 'color' && (value === 'rgb(0, 0, 0)' || value === '#000000')) {
                                                return; // 跳过默认黑色
                                            }
                                            if (property === 'font-size' && value === '16px') {
                                                return; // 跳过默认字体大小
                                            }
                                            if (property === 'display' && value === 'table-caption') {
                                                styleString += 'display: block; '; // 改为block显示
                                                return;
                                            }
                                            
                                            styleString += `${property}: ${value}; `;
                                        }
                                    });
                                    
                                    // 确保为块级元素
                                    if (!styleString.includes('display:')) {
                                        styleString += 'display: block; ';
                                    }
                                    
                                    // 添加适当的边距
                                    if (!styleString.includes('margin-bottom:') && !styleString.includes('margin:')) {
                                        styleString += 'margin-bottom: 10px; ';
                                    }
                                    
                                    if (styleString.trim()) {
                                        captionDiv.setAttribute('style', styleString.trim());
                                        console.log('✅ 应用了标题样式:', styleString.substring(0, 100) + '...');
                                    }
                                }
                                
                                // 在表格前插入标题div
                                clonedTable.parentNode.insertBefore(captionDiv, clonedTable);
                                console.log('✅ 在表格前插入了标题文字:', captionElement.textContent);
                                
                                // 移除原来的caption元素
                                if (clonedCaption) {
                                    clonedCaption.remove();
                                    console.log('✅ 移除了原始caption元素');
                                }
                            }
                        } else {
                            console.warn('❌ 未找到匹配的原始表格');
                        }
                    } catch (tableError) {
                        console.warn('表格处理失败:', tableError);
                    }
                });
                
                // 遍历所有元素，确保样式被保留
                const allElements = tempContainer.querySelectorAll('*');
                const originalElements = originalRange.commonAncestorContainer.querySelectorAll ? 
                    originalRange.commonAncestorContainer.querySelectorAll('*') : [];
                
                // 为每个元素应用计算样式
                allElements.forEach((element, index) => {
                    try {
                        // 尝试找到对应的原始元素
                        let originalElement = null;
                        if (originalElements[index] && originalElements[index].tagName === element.tagName) {
                            originalElement = originalElements[index];
                        } else {
                            // 按标签名和内容匹配
                            const matches = Array.from(originalElements).filter(el => 
                                el.tagName === element.tagName && 
                                el.textContent === element.textContent
                            );
                            originalElement = matches[0];
                        }
                        
                        if (originalElement) {
                            const computedStyle = window.getComputedStyle(originalElement);
                            
                            // 获取重要的可视样式属性
                            const importantStyles = [
                                'color', 'background-color', 'background', 'font-size', 'font-weight', 
                                'font-family', 'font-style', 'text-decoration', 'text-decoration-line',
                                'text-decoration-color', 'text-decoration-style', 'text-align', 
                                'line-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 
                                'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 
                                'padding-left', 'border', 'border-color', 'border-style', 'border-width',
                                'border-radius', 'display', 'width', 'height', 'max-width', 'max-height',
                                'min-width', 'min-height', 'vertical-align', 'text-transform', 'letter-spacing',
                                'word-spacing', 'white-space', 'opacity', 'box-shadow', 'text-shadow',
                                'caption-side' // 添加表格标题专用样式
                            ];
                            
                            let styleString = element.getAttribute('style') || '';
                            
                            importantStyles.forEach(property => {
                                const value = computedStyle.getPropertyValue(property);
                                if (value && 
                                    value !== 'initial' && 
                                    value !== 'normal' && 
                                    value !== 'none' && 
                                    value !== 'auto' &&
                                    value !== 'rgba(0, 0, 0, 0)' &&
                                    value !== 'transparent' &&
                                    !styleString.includes(property)) {
                                    
                                    // 检查是否是默认值
                                    if (property === 'color' && (value === 'rgb(0, 0, 0)' || value === '#000000')) {
                                        return; // 跳过默认黑色
                                    }
                                    if (property === 'font-size' && value === '16px') {
                                        return; // 跳过默认字体大小
                                    }
                                    
                                    styleString += `${property}: ${value}; `;
                                }
                            });
                            
                            if (styleString.trim()) {
                                element.setAttribute('style', styleString.trim());
                            }
                        }
                    } catch (styleError) {
                        console.warn('单个元素样式处理失败:', styleError);
                    }
                });
                
                // 应用标题替换（在生成HTML之前）
                const headingReplacements = applyHeadingReplacements(tempContainer);
                
                // 应用链接处理（在标题替换之后）
                const linkProcessedCount = applyLinkProcessing(tempContainer);
                
                // 应用页脚过滤（在链接处理之后）
                const footerFilteredCount = applyFooterFilter(tempContainer);
                
                // 应用空行清理（在页脚过滤之后）
                const cleanupCount = applyEmptyLineCleanup(tempContainer);
                
                fullHtml = tempContainer.innerHTML;
                plainText = tempContainer.textContent || tempContainer.innerText || '';
                
                let logMessage = '✅ 使用增强样式保持方法（包含表格标题处理';
                if (headingReplacements > 0) {
                    logMessage += '和标题替换';
                }
                if (linkProcessedCount > 0) {
                    logMessage += '和链接处理';
                }
                if (footerFilteredCount > 0) {
                    logMessage += '和页脚过滤';
                }
                if (cleanupCount > 0) {
                    logMessage += '和空行清理';
                }
                logMessage += '）';
                console.log(logMessage);
            } else {
                throw new Error('无法获取选中区域信息');
            }
        } catch (enhancedError) {
            console.warn('增强样式提取失败，使用基础方法:', enhancedError);
            
            // 回退到基础方法
            const container = document.createElement('div');
            const clonedFragment = originalRange.cloneContents();
            container.appendChild(clonedFragment);
            
            // 如果是全选操作，移除插件添加的元素
            if (isSelectAll) {
                console.log('🧹 基础方法：清理插件添加的元素...');
                
                // 移除配置相关元素
                const configElements = container.querySelectorAll('[id="imageInlinerConfigBtn"], [data-image-inliner-config], [id="headingConfigUI"], [data-image-inliner-test="true"]');
                configElements.forEach(elem => {
                    elem.remove();
                    console.log('🗑️ 基础方法：移除插件元素');
                });
            }
            
            // 即使在基础方法中也应用标题替换
            applyHeadingReplacements(container);
            
            // 应用链接处理
            applyLinkProcessing(container);
            
            // 应用页脚过滤
            applyFooterFilter(container);
            
            // 应用空行清理
            applyEmptyLineCleanup(container);
            
            fullHtml = container.innerHTML;
            plainText = container.textContent || container.innerText || '';
        }
        
        // 确保我们有有效的内容
        if (!fullHtml) {
            const container = document.createElement('div');
            const clonedFragment = originalRange.cloneContents();
            container.appendChild(clonedFragment);
            
            // 如果是全选操作，移除插件添加的元素
            if (isSelectAll) {
                console.log('🧹 后备方法：清理插件添加的元素...');
                const configElements = container.querySelectorAll('[id="imageInlinerConfigBtn"], [data-image-inliner-config], [id="headingConfigUI"], [data-image-inliner-test="true"]');
                configElements.forEach(elem => elem.remove());
            }
            
            // 应用标题替换
            applyHeadingReplacements(container);
            
            // 应用链接处理
            applyLinkProcessing(container);
            
            // 应用页脚过滤
            applyFooterFilter(container);
            
            // 应用空行清理
            applyEmptyLineCleanup(container);
            
            fullHtml = container.innerHTML;
            plainText = container.textContent || container.innerText || '';
        }

        e.clipboardData.setData('text/html', fullHtml);
        e.clipboardData.setData('text/plain', plainText);

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
                // 使用保留样式的HTML容器替换图片URL
                const workingContainer = document.createElement('div');
                workingContainer.innerHTML = fullHtml;
                const containerImages = workingContainer.querySelectorAll('img');
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
                        
                        // 保持图片的显示样式
                        if (!img.style.maxWidth && !img.style.width) {
                            img.style.maxWidth = '100%';
                        }
                        if (!img.style.height) {
                            img.style.height = 'auto';
                        }
                        
                        successCount++;
                        console.log('✅ 图片转换成功:', src.substring(0, 50) + '...');
                    } else {
                        console.warn('❌ 图片转换失败:', src, result?.error);
                    }
                });

                if (successCount > 0) {
                    // 获取处理后的HTML，保持所有样式
                    const modifiedHtml = workingContainer.innerHTML;
                    const textContent = workingContainer.textContent || workingContainer.innerText || '';

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
                        console.log('✅ 剪贴板已更新，包含', successCount, '张内联图片，保持原始格式' + (headingReplacementConfig.enabled ? '，应用了标题替换' : ''));
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
        <h1 style="color: red;">测试标题1</h1>
        <h2 style="color: blue;">测试标题2</h2>
        <p>测试文本</p>
        <img src="https://via.placeholder.com/50x50/ff0000/ffffff?text=TEST" alt="测试图片">
    `;
    
    // 设置测试内容不可选择和标记
    testDiv.style.cssText = `
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        position: fixed;
        top: -9999px;
        left: -9999px;
        opacity: 0;
        pointer-events: none;
        z-index: -1;
    `;
    testDiv.setAttribute('data-image-inliner-test', 'true');
    
    // 选择测试内容
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(testDiv);
    selection.removeAllRanges();
    selection.addRange(range);
    
    console.log('🧪 测试内容已选择，当前标题替换配置:', headingReplacementConfig);
    console.log('🧪 请按Ctrl+C复制测试');
    document.body.appendChild(testDiv);
    
    setTimeout(() => {
        testDiv.remove();
    }, 5000);
};

// 添加配置管理的全局函数
window.imageInlinerConfig = {
    show: showHeadingConfigUI,
    getHeadingConfig: () => headingReplacementConfig,
    setHeadingConfig: (config) => {
        headingReplacementConfig = { ...headingReplacementConfig, ...config };
        saveHeadingConfig();
    },
    getEmptyLineConfig: () => emptyLineCleanupConfig,
    setEmptyLineConfig: (config) => {
        emptyLineCleanupConfig = { ...emptyLineCleanupConfig, ...config };
        saveEmptyLineConfig();
    },
    getLinkProcessingConfig: () => linkProcessingConfig,
    setLinkProcessingConfig: (config) => {
        linkProcessingConfig = { ...linkProcessingConfig, ...config };
        saveLinkProcessingConfig();
    },
    resetHeading: () => {
        headingReplacementConfig = {
            enabled: false,
            replacements: {
                'h1': 'h3',
                'h2': 'h3',
                'h3': 'h3',
                'h4': 'h4',
                'h5': 'h5',
                'h6': 'h6'
            }
        };
        saveHeadingConfig();
    },
    resetEmptyLine: () => {
        emptyLineCleanupConfig = {
            enabled: true,
            removeEmptyParagraphs: true,
            removeEmptyDivs: true,
            removeExcessiveLineBreaks: true,
            compactSpacing: true
        };
        saveEmptyLineConfig();
    },
    resetLinkProcessing: () => {
        linkProcessingConfig = {
            enabled: true,
            removeLinks: true,
            convertToRedText: true,
            redColor: '#ff4d4f'
        };
        saveLinkProcessingConfig();
    }
};

console.log('💡 提示：');
console.log('- 运行 testImageInliner() 测试功能');
console.log('- 运行 imageInlinerConfig.show() 打开配置界面');
console.log('- 使用快捷键 Ctrl+Shift+H 打开配置界面');
console.log('- 可用配置：标题替换 + 链接处理 + 空行清理');
console.log('- 链接处理：移除链接并转为红色文字（默认启用）');
console.log('- 空行清理：移除多余空行让内容更紧凑（默认启用）');

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

// 全局配置管理对象
const configManager = {
    // 标题替换配置管理
    headingReplacement: {
        load: loadHeadingReplacementConfig,
        save: saveHeadingReplacementConfig,
        updateUI: updateHeadingReplacementUI,
        updateFromUI: updateHeadingReplacementConfigFromUI,
        reset: resetConfigUI
    },
    
    // 空行清理配置管理
    emptyLineCleanup: {
        load: loadEmptyLineCleanupConfig,
        save: saveEmptyLineCleanupConfig,
        updateUI: updateEmptyLineCleanupUI,
        updateFromUI: updateEmptyLineConfigFromUI
    },
    
    // 链接处理配置管理
    linkProcessing: {
        load: loadLinkProcessingConfig,
        save: saveLinkProcessingConfig,
        updateUI: updateLinkProcessingUI,
        updateFromUI: updateLinkProcessingConfigFromUI
    },
    
    // 页脚过滤配置管理
    footerFilter: {
        load: loadFooterFilterConfig,
        save: saveFooterFilterConfig,
        updateUI: updateFooterFilterUI,
        updateFromUI: updateFooterFilterConfigFromUI
    },
    
    // 全局配置操作
    saveAll: saveAllConfigFromUI,
    loadAll: function() {
        this.headingReplacement.load();
        this.emptyLineCleanup.load();
        this.linkProcessing.load();
        this.footerFilter.load();
    },
    
    updateAllUI: function() {
        this.headingReplacement.updateUI();
        this.emptyLineCleanup.updateUI();
        this.linkProcessing.updateUI();
        this.footerFilter.updateUI();
    },
    
    resetAll: function() {
        this.headingReplacement.reset();
        // 重置其他配置...
        console.log('📋 所有配置已重置为默认值');
    }
};

// 初始化配置管理器
console.log('🔧 配置管理器已初始化');
