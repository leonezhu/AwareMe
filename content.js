// AwareMe 内容脚本

class AwareMeContent {
  constructor() {
    this.reminderModal = null;
    this.loadingOverlay = null;
    this.init();
  }

  async init() {
    // 先检查当前域名是否需要监控，只有需要监控的域名才显示遮罩
    const shouldShowOverlay = await this.shouldShowLoadingOverlay();
    
    if (shouldShowOverlay) {
      // 立即创建加载遮罩（在document_start阶段）
      this.createLoadingOverlay();
      
      // 立即异步检查页面访问权限，不等待DOM加载完成
      this.checkCurrentPage();
    }
    
    // 等待DOM加载完成后再进行其他初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initAfterDOMLoaded(shouldShowOverlay);
      });
    } else {
      this.initAfterDOMLoaded(shouldShowOverlay);
    }
    
    // 监听来自后台脚本的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'showReminder') {
        this.removeLoadingOverlay();
        this.showReminderModal(message.message, message.reminderType, message.data);
        sendResponse({ success: true });
      } else if (message.type === 'pageAllowed') {
        // 页面被允许访问，移除遮罩
        this.removeLoadingOverlay();
        sendResponse({ success: true });
      }
    });
  }

  async shouldShowLoadingOverlay() {
    try {
      // 获取当前域名
      const currentDomain = this.extractDomain(window.location.href);
      if (!currentDomain) {
        return false;
      }

      // 获取用户配置
      const result = await chrome.storage.local.get(['userConfig', 'isEnabled']);
      const userConfig = result.userConfig;
      const isEnabled = result.isEnabled;

      // 如果插件未启用，不显示遮罩
      if (!isEnabled) {
        return false;
      }

      // 如果没有配置，不显示遮罩
      if (!userConfig) {
        return false;
      }

      // 检查当前域名是否在任何配置的domains列表中
      const allConfiguredDomains = [];
      
      // 收集所有配置中的域名
      if (userConfig.visitReminders) {
        userConfig.visitReminders.forEach(reminder => {
          if (reminder.domains) {
            allConfiguredDomains.push(...reminder.domains);
          }
        });
      }
      
      if (userConfig.durationLimits) {
        userConfig.durationLimits.forEach(limit => {
          if (limit.domains) {
            allConfiguredDomains.push(...limit.domains);
          }
        });
      }
      
      if (userConfig.weeklyLimits) {
        userConfig.weeklyLimits.forEach(limit => {
          if (limit.domains) {
            allConfiguredDomains.push(...limit.domains);
          }
        });
      }

      // 检查当前域名是否匹配任何配置的域名
      return allConfiguredDomains.some(domain => currentDomain.includes(domain));
    } catch (error) {
      console.error('检查是否显示遮罩失败:', error);
      // 出错时不显示遮罩
      return false;
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // 提取一级域名（如从www.bilibili.com提取bilibili.com）
      // 匹配最后两个部分作为一级域名
      const domainParts = hostname.split('.');
      
      // 如果只有两部分或更少（如bilibili.com或localhost），直接返回
      if (domainParts.length <= 2) {
        return hostname;
      }
      
      // 否则返回最后两部分（如从www.bilibili.com返回bilibili.com）
      return domainParts.slice(-2).join('.');
    } catch (error) {
      console.error('提取域名失败:', error);
      return null;
    }
  }

  initAfterDOMLoaded(shouldShowOverlay) {
    // DOM加载完成后的其他初始化工作
    // 页面检查已经在init方法中立即执行了，这里不需要再次调用
  }

  createLoadingOverlay() {
    // 如果已有遮罩，先移除
    if (this.loadingOverlay) {
      this.loadingOverlay.remove();
    }

    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.className = 'awareme-loading-overlay';
    this.loadingOverlay.innerHTML = `
      <div class="awareme-loading-content">
        <div class="awareme-loading-spinner"></div>
        <div class="awareme-loading-text">正在检查访问权限...</div>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .awareme-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.95);
        z-index: 999999;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .awareme-loading-content {
        text-align: center;
        padding: 40px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(0, 0, 0, 0.1);
      }
      
      .awareme-loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #007AFF;
        border-radius: 50%;
        animation: awareme-spin 1s linear infinite;
        margin: 0 auto 20px;
      }
      
      .awareme-loading-text {
        color: #333;
        font-size: 16px;
        font-weight: 500;
      }
      
      @keyframes awareme-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    
    // 在document_start阶段，使用document.documentElement
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }
    
    // 直接添加到documentElement，因为body可能还不存在
    document.documentElement.appendChild(this.loadingOverlay);
  }

  removeLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.remove();
      this.loadingOverlay = null;
    }
  }

  async checkCurrentPage() {
    // 发送消息给background检查当前页面
    try {
      await chrome.runtime.sendMessage({ type: 'checkCurrentPage', url: window.location.href });
    } catch (error) {
      console.error('检查页面失败:', error);
      // 如果检查失败，移除遮罩允许访问
      this.removeLoadingOverlay();
    }
  }

  showReminderModal(message, type, data = {}) {
    // 如果已有提醒窗口，先移除
    if (this.reminderModal) {
      this.reminderModal.remove();
    }

    // 保存当前规则信息
    this.currentRule = data.rule || {};

    // 创建提醒模态框
    this.reminderModal = this.createReminderModal(message, type, data);
    document.body.appendChild(this.reminderModal);

    // 1秒后自动显示关闭按钮和关闭网页按钮
    setTimeout(() => {
      const closeBtn = this.reminderModal.querySelector('.awareme-close-btn');
      const closePageBtn = this.reminderModal.querySelector('.awareme-close-page-btn');
      if (closeBtn) {
        closeBtn.style.display = 'block';
        // 如果需要多次确认，显示剩余次数
        const confirmTimes = this.currentRule?.confirmTimes || 1;
        if (confirmTimes > 1) {
          closeBtn.textContent = `坚持访问 (${confirmTimes})`;
        }
      }
      if (closePageBtn) {
        closePageBtn.style.display = 'block';
      }
    }, 500);
  }

  createReminderModal(message, type, data = {}) {
    const modal = document.createElement('div');
    modal.className = 'awareme-reminder-modal';
    modal.innerHTML = `
      <div class="awareme-modal-content">
        <div class="awareme-modal-header">
          <div class="awareme-icon">
            ${this.getIconForType(type)}
          </div>
          <h3 class="awareme-title">AwareMe 提醒</h3>
        </div>
        <div class="awareme-modal-body">
          <p class="awareme-message">${this.formatMessage(message, data)}</p>
        </div>
        <div class="awareme-modal-footer">
          <button class="awareme-close-btn" style="display: none;">坚持访问</button>
          <button class="awareme-close-page-btn" style="display: none;">关闭网页</button>
          <button class="awareme-settings-btn">设置</button>
        </div>
      </div>
      <div class="awareme-modal-overlay"></div>
    `;

    // 添加样式
    this.addModalStyles(modal);

    // 添加事件监听
    this.addModalEventListeners(modal);

    return modal;
  }

  getIconForType(type) {
    const icons = {
      visit: '🔔',
      duration: '⏰',
      weekly: '📊'
    };
    return icons[type] || '💡';
  }

  formatMessage(message, data = {}) {
    // 替换占位符
    let formattedMessage = message;
    
    // 替换访问次数占位符
    if (data.visitCount !== undefined) {
      formattedMessage = formattedMessage.replace(/\{\{limitNum\}\}/g, data.visitCount);
    }
    
    // 替换访问时长占位符
    if (data.durationMinutes !== undefined) {
      formattedMessage = formattedMessage.replace(/\{\{limitTime\}\}/g, data.durationMinutes);
    }
    
    // 支持简单的 Markdown 格式
    return formattedMessage
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  addModalStyles(modal) {
    const style = document.createElement('style');
    style.textContent = `
      .awareme-reminder-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .awareme-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(2px);
        z-index: 1;
        transition: opacity 0.2s ease;
      }

      .awareme-modal-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        max-width: 400px;
        width: 90%;
        animation: awaremeSlideIn 0.3s ease-out;
        z-index: 2;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .awareme-fade-out {
        opacity: 0 !important;
      }

      .awareme-modal-content.awareme-fade-out {
        transform: translate(-50%, -55%) !important;
      }

      @keyframes awaremeSlideIn {
        from {
          opacity: 0;
          transform: translate(-50%, -60%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }

      .awareme-modal-header {
        padding: 20px 20px 10px;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .awareme-icon {
        font-size: 24px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f0f9ff;
        border-radius: 50%;
      }

      .awareme-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
      }

      .awareme-modal-body {
        padding: 0 20px 20px;
      }

      .awareme-message {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: #4b5563;
      }

      .awareme-modal-footer {
        padding: 0 20px 20px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }

      .awareme-close-btn,
      .awareme-close-page-btn,
      .awareme-settings-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .awareme-close-btn {
        background: #3b82f6;
        color: white;
      }

      .awareme-close-btn:hover {
        background: #2563eb;
      }

      .awareme-close-page-btn {
        background: #ef4444;
        color: white;
      }

      .awareme-close-page-btn:hover {
        background: #dc2626;
      }

      .awareme-settings-btn {
        background: #f3f4f6;
        color: #374151;
      }

      .awareme-settings-btn:hover {
        background: #e5e7eb;
      }
    `;
    modal.appendChild(style);
  }

  addModalEventListeners(modal) {
    const closeBtn = modal.querySelector('.awareme-close-btn');
    const closePageBtn = modal.querySelector('.awareme-close-page-btn');
    const settingsBtn = modal.querySelector('.awareme-settings-btn');
    const overlay = modal.querySelector('.awareme-modal-overlay');

    // 获取当前规则的确认次数配置
    const confirmTimes = this.currentRule?.confirmTimes || 1;
    let clickCount = 0;
    let isLoading = false;

    // 关闭按钮
    closeBtn.addEventListener('click', () => {
      if (isLoading) return; // 防止重复点击
      
      clickCount++;
      
      if (clickCount >= confirmTimes) {
        // 达到确认次数，关闭模态框
        this.closeModal(modal);
        return;
      }
      
      // 设置loading状态
      isLoading = true;
      const originalText = closeBtn.textContent;
      closeBtn.textContent = '请稍候...';
      closeBtn.style.opacity = '0.6';
      closeBtn.style.cursor = 'not-allowed';
      
      // 0.5秒后恢复
      setTimeout(() => {
        isLoading = false;
        closeBtn.textContent = `坚持访问 (${confirmTimes - clickCount})`;
        closeBtn.style.opacity = '1';
        closeBtn.style.cursor = 'pointer';
      }, 500);
    });

    // 关闭网页按钮
    closePageBtn.addEventListener('click', () => {
      // 先关闭模态框
      // this.closeModal(modal);
      // 延迟一点时间后关闭网页，让用户看到模态框关闭的动画
      // setTimeout(() => {
        // 使用chrome.tabs API关闭当前标签页
        chrome.runtime.sendMessage({ type: 'closeCurrentTab' });
      // }, 300);
    });

    // 设置按钮
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openOptions' });
      this.closeModal(modal);
    });

    // 点击遮罩层关闭（3秒后才能点击）
    // setTimeout(() => {
    //   overlay.addEventListener('click', () => {
    //     this.closeModal(modal);
    //   });
    // }, 3000);
  
    // // ESC 键关闭（3秒后才能使用）
    // setTimeout(() => {
    //   const handleEscape = (e) => {
    //     if (e.key === 'Escape') {
    //       this.closeModal(modal);
    //       document.removeEventListener('keydown', handleEscape);
    //     }
    //   };
    //   document.addEventListener('keydown', handleEscape);
    // }, 3000);
  }

  closeModal(modal) {
    // 添加淡出动画类
    modal.querySelector('.awareme-modal-content').classList.add('awareme-fade-out');
    modal.querySelector('.awareme-modal-overlay').classList.add('awareme-fade-out');
    
    // 200ms 后移除模态框
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      if (this.reminderModal === modal) {
        this.reminderModal = null;
      }
    }, 200);
  }
}

// 初始化内容脚本
new AwareMeContent();