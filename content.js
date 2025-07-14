// AwareMe 内容脚本

class AwareMeContent {
  constructor() {
    this.reminderModal = null;
    this.loadingOverlay = null;
    this.mutationObserver = null;
    this.isPageAllowed = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.init();
  }

  async init() {
    console.log('AwareMe: Content script 初始化开始');
    
    // 先检查当前域名是否需要监控，只有需要监控的域名才显示遮罩
    const shouldShowOverlay = await this.shouldShowLoadingOverlay();
    
    if (shouldShowOverlay) {
      // 立即创建加载遮罩（在document_start阶段）
      this.createLoadingOverlay();
      this.setupOverlayProtection();
      
      // 设置超时机制，防止遮罩一直显示
      this.setupOverlayTimeout();
      
      // 立即异步检查页面访问权限，不等待DOM加载完成
      this.checkCurrentPage();
    } else {
      console.log('AwareMe: 当前页面不需要监控');
    }
    
    // 等待DOM加载完成后再进行其他初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initAfterDOMLoaded(shouldShowOverlay);
      }, { passive: true });
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
        console.log('AwareMe: 收到页面允许访问消息');
        this.isPageAllowed = true;
        this.removeLoadingOverlay();
        sendResponse({ success: true });
      }
      return true; // 保持消息通道开放
    });
    
    // 添加页面卸载保护
    this.setupUnloadProtection();
    
    console.log('AwareMe: Content script 初始化完成');
  }

  async shouldShowLoadingOverlay() {
    try {
      // 获取当前域名
      const currentDomain = AwareMeUtils.extractDomain(window.location.href);
      if (!currentDomain) {
        console.log('AwareMe: 无法提取域名，不显示遮罩');
        return false;
      }

      console.log(`AwareMe: 检查域名 ${currentDomain} 是否需要监控`);

      // 获取用户配置和插件状态
      const result = await chrome.storage.local.get(['userConfig', 'isEnabled']);
      const userConfig = result.userConfig;
      const isEnabled = result.isEnabled;

      // 如果插件未启用，不显示遮罩
      if (isEnabled === false) {
        console.log('AwareMe: 插件未启用，不显示遮罩');
        return false;
      }

      // 如果没有配置，尝试加载默认配置
      let configToCheck = userConfig;
      if (!configToCheck) {
        console.log('AwareMe: 用户配置不存在，尝试加载默认配置');
        configToCheck = await AwareMeUtils.loadConfig();
      }

      // 如果仍然没有配置，不显示遮罩
      if (!configToCheck) {
        console.log('AwareMe: 无法加载任何配置，不显示遮罩');
        return false;
      }

      // 使用工具类检查域名是否在配置中
      const shouldShow = AwareMeUtils.isDomainConfigured(currentDomain, configToCheck);
      console.log(`AwareMe: 域名 ${currentDomain} ${shouldShow ? '需要' : '不需要'} 监控`);
      return shouldShow;
    } catch (error) {
      console.error('AwareMe: 检查是否显示遮罩失败:', error);
      // 出错时不显示遮罩
      return false;
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
        overflow: hidden;
        touch-action: none;
      }
      
      body.awareme-no-scroll {
        overflow: hidden !important;
        position: fixed !important;
        width: 100% !important;
        height: 100% !important;
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
    
    // 防止页面滚动
    if (document.body) {
      document.body.classList.add('awareme-no-scroll');
    } else {
      // 如果body还不存在，等待DOM加载完成后添加
      document.addEventListener('DOMContentLoaded', () => {
        if (this.loadingOverlay && document.body) {
          document.body.classList.add('awareme-no-scroll');
        }
      }, { passive: true });
    }
  }

  removeLoadingOverlay() {
    if (this.loadingOverlay) {
      console.log('AwareMe: 移除加载遮罩');
      // 停止监控
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      // 清除超时定时器
      if (this.overlayTimeout) {
        clearTimeout(this.overlayTimeout);
        this.overlayTimeout = null;
      }
      // 恢复页面滚动
      if (document.body) {
        document.body.classList.remove('awareme-no-scroll');
      }
      this.loadingOverlay.remove();
      this.loadingOverlay = null;
    }
  }

  setupOverlayTimeout() {
    // 设置6秒超时，防止遮罩一直显示
    // 减少超时时间，因为现在有了更好的初始化和缓存预热机制
    this.overlayTimeout = setTimeout(() => {
      if (this.loadingOverlay && !this.isPageAllowed) {
        console.warn('AwareMe: 检查超时，自动移除遮罩允许访问');
        this.isPageAllowed = true;
        // this.removeLoadingOverlay();
        //刷新当前网页
        window.location.reload();
      }
    }, 6000); 
  }

  async checkCurrentPage() {
    // 发送消息给background检查当前页面
    const maxRetries = 4; // 减少重试次数，因为现在有更好的初始化机制
    let retryCount = 0;
    
    const attemptCheck = async () => {
      try {
        console.log(`AwareMe: 发送页面检查请求 (第${retryCount + 1}次)`);
        
        // 使用Promise包装sendMessage以便更好地处理错误，并添加请求超时
        const response = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: 'checkCurrentPage', url: window.location.href },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              }
            );
          }),
          // 单次请求超时设置为3秒
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('请求超时')), 3000);
          })
        ]);
        
        console.log('AwareMe: 页面检查请求发送成功');
      } catch (error) {
        console.error(`AwareMe: 页面检查失败 (第${retryCount + 1}次):`, error);
        
        // 如果是"Receiving end does not exist"错误或请求超时，说明background script还未准备好
        if (error.message.includes('Receiving end does not exist') || 
            error.message.includes('Extension context invalidated') ||
            error.message.includes('请求超时')) {
          if (retryCount < maxRetries) {
            retryCount++;
            // 优化重试间隔：100ms, 300ms, 800ms, 1500ms
            const delays = [100, 300, 800, 1500];
            const delay = delays[retryCount - 1] || 1500;
            console.log(`AwareMe: Background script未准备好，${delay}ms后重试`);
            setTimeout(attemptCheck, delay);
          } else {
            console.warn('AwareMe: Background script长时间未响应，允许访问页面');
            this.isPageAllowed = true;
            this.removeLoadingOverlay();
          }
        } else {
          // 其他类型的错误，直接允许访问
          console.warn('AwareMe: 检查过程中发生未知错误，允许访问页面');
          this.isPageAllowed = true;
          this.removeLoadingOverlay();
        }
      }
    };
    
    await attemptCheck();
  }

  setupOverlayProtection() {
    if (!this.loadingOverlay) return;
    
    console.log('AwareMe: 设置遮罩保护机制');
    
    // 使用MutationObserver监控遮罩是否被移除
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // 检查遮罩是否还在DOM中
          if (this.loadingOverlay && !document.contains(this.loadingOverlay)) {
            if (!this.isPageAllowed && this.retryCount < this.maxRetries) {
              console.log(`AwareMe: 检测到遮罩被移除，重新创建 (第${this.retryCount + 1}次)`);
              this.retryCount++;
              this.createLoadingOverlay();
              this.setupOverlayProtection();
            }
          }
        }
      });
    });
    
    // 监控整个document的变化
    this.mutationObserver.observe(document, {
      childList: true,
      subtree: true
    });
    
    // 定期检查遮罩状态
    const checkInterval = setInterval(() => {
      if (this.isPageAllowed) {
        clearInterval(checkInterval);
        return;
      }
      
      if (this.loadingOverlay && !document.contains(this.loadingOverlay)) {
        if (this.retryCount < this.maxRetries) {
          console.log(`AwareMe: 定期检查发现遮罩丢失，重新创建 (第${this.retryCount + 1}次)`);
          this.retryCount++;
          this.createLoadingOverlay();
          this.setupOverlayProtection();
        }
      }
    }, 1000);
  }

  setupUnloadProtection() {
    // 防止页面跳转绕过检查
    window.addEventListener('beforeunload', (event) => {
      if (this.loadingOverlay && !this.isPageAllowed) {
        console.log('AwareMe: 页面尝试卸载，但检查未完成');
        event.preventDefault();
        event.returnValue = '页面正在进行安全检查，请稍候...';
        return '页面正在进行安全检查，请稍候...';
      }
    });
    
    // 防止通过修改location绕过
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      if (window.awareMe && window.awareMe.loadingOverlay && !window.awareMe.isPageAllowed) {
        console.log('AwareMe: 阻止history.pushState操作');
        return;
      }
      return originalPushState.apply(this, args);
    };
    
    history.replaceState = function(...args) {
      if (window.awareMe && window.awareMe.loadingOverlay && !window.awareMe.isPageAllowed) {
        console.log('AwareMe: 阻止history.replaceState操作');
        return;
      }
      return originalReplaceState.apply(this, args);
    };
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
    
    // 防止页面滚动
    document.body.classList.add('awareme-no-scroll');

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
    }, 100);
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
        overflow: hidden;
        touch-action: none;
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
        overflow: hidden;
        touch-action: none;
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
    }, { passive: true });

    // 关闭网页按钮
    closePageBtn.addEventListener('click', () => {
      // 先关闭模态框
      // this.closeModal(modal);
      // 延迟一点时间后关闭网页，让用户看到模态框关闭的动画
      // setTimeout(() => {
        // 使用chrome.tabs API关闭当前标签页
        chrome.runtime.sendMessage({ type: 'closeCurrentTab' });
      // }, 300);
    }, { passive: true });

    // 设置按钮
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openOptions' });
      // 不关闭模态框，保持拦截状态
      // 添加页面可见性监听，当用户从设置页面返回时重新显示模态框
      this.handleSettingsNavigation(modal);
    }, { passive: true });

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

  handleSettingsNavigation(modal) {
    console.log('AwareMe: 处理设置页面导航，隐藏模态框但保持拦截状态');
    
    // 隐藏模态框但不移除
    modal.style.display = 'none';
    
    // 如果没有加载遮罩，创建一个以保持拦截状态
    if (!this.loadingOverlay) {
      console.log('AwareMe: 创建加载遮罩以保持拦截状态');
      this.createLoadingOverlay();
      this.setupOverlayProtection();
    }
    
    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('AwareMe: 页面重新可见，恢复提醒模态框');
        // 页面重新可见时，重新显示模态框并移除加载遮罩
        setTimeout(() => {
          if (modal && modal.parentNode) {
            modal.style.display = 'block';
            // 移除加载遮罩，因为提醒模态框已经显示
            this.removeLoadingOverlay();
          }
        }, 500); // 延迟500ms确保页面完全加载
        
        // 移除监听器
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    
    // 备用方案：监听窗口焦点变化
    const handleFocus = () => {
      console.log('AwareMe: 窗口重新获得焦点，恢复提醒模态框');
      setTimeout(() => {
        if (modal && modal.parentNode) {
          modal.style.display = 'block';
          // 移除加载遮罩，因为提醒模态框已经显示
          this.removeLoadingOverlay();
        }
      }, 500);
      
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    
    window.addEventListener('focus', handleFocus, { passive: true });
  }

  closeModal(modal) {
    // 添加淡出动画类
    modal.querySelector('.awareme-modal-content').classList.add('awareme-fade-out');
    modal.querySelector('.awareme-modal-overlay').classList.add('awareme-fade-out');
    
    // 恢复页面滚动
    document.body.classList.remove('awareme-no-scroll');
    
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
window.awareMe = new AwareMeContent();