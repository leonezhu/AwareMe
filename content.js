// AwareMe 内容脚本

class AwareMeContent {
  constructor() {
    this.reminderModal = null;
    this.init();
  }

  init() {
    // 监听来自后台脚本的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'showReminder') {
        this.showReminderModal(message.message, message.reminderType);
        sendResponse({ success: true });
      }
    });
  }

  showReminderModal(message, type) {
    // 如果已有提醒窗口，先移除
    if (this.reminderModal) {
      this.reminderModal.remove();
    }

    // 创建提醒模态框
    this.reminderModal = this.createReminderModal(message, type);
    document.body.appendChild(this.reminderModal);

    // 3秒后自动显示关闭按钮
    setTimeout(() => {
      const closeBtn = this.reminderModal.querySelector('.awareme-close-btn');
      if (closeBtn) {
        closeBtn.style.display = 'block';
      }
    }, 3000);
  }

  createReminderModal(message, type) {
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
          <p class="awareme-message">${this.formatMessage(message)}</p>
        </div>
        <div class="awareme-modal-footer">
          <button class="awareme-close-btn" style="display: none;">我知道了</button>
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

  formatMessage(message) {
    // 支持简单的 Markdown 格式
    return message
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
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
        z-index: 1;
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
    const settingsBtn = modal.querySelector('.awareme-settings-btn');
    const overlay = modal.querySelector('.awareme-modal-overlay');

    // 关闭按钮
    closeBtn.addEventListener('click', () => {
      this.closeModal(modal);
    });

    // 设置按钮
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openOptions' });
      this.closeModal(modal);
    });

    // 点击遮罩层关闭（3秒后才能点击）
    setTimeout(() => {
      overlay.addEventListener('click', () => {
        this.closeModal(modal);
      });
    }, 3000);

    // ESC 键关闭（3秒后才能使用）
    setTimeout(() => {
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          this.closeModal(modal);
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    }, 3000);
  }

  closeModal(modal) {
    modal.style.animation = 'awaremeSlideOut 0.2s ease-in';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      if (this.reminderModal === modal) {
        this.reminderModal = null;
      }
    }, 200);

    // 添加退出动画
    const style = document.createElement('style');
    style.textContent = `
      @keyframes awaremeSlideOut {
        from {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
        to {
          opacity: 0;
          transform: translate(-50%, -60%);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// 初始化内容脚本
new AwareMeContent();