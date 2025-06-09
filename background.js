// AwareMe 后台脚本

class AwareMeBackground {
  constructor() {
    this.activeTabId = null;
    this.startTime = null;
    this.config = null;
    this.init();
  }

  async init() {
    // 加载配置
    await this.loadConfig();
    
    // 监听来自内容脚本的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'openOptions') {
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
      } else if (message.type === 'closeCurrentTab') {
        // 关闭发送消息的标签页
        if (sender.tab && sender.tab.id) {
          chrome.tabs.remove(sender.tab.id);
        }
        sendResponse({ success: true });
      }
    });
    
    // 监听标签页更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tab);
      }
    });

    // 监听标签页激活
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabActivated(activeInfo.tabId);
    });

    // 监听窗口焦点变化
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.handleWindowBlur();
      } else {
        this.handleWindowFocus();
      }
    });

    // 定时检查浏览时长
    setInterval(() => {
      this.checkDurationLimits();
    }, 60000); // 每分钟检查一次
  }

  async loadConfig() {
    try {
      const result = await chrome.storage.local.get(['userConfig']);
      if (result.userConfig) {
        this.config = result.userConfig;
      } else {
        // 加载默认配置
        const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
        this.config = await response.json();
        await chrome.storage.local.set({ userConfig: this.config });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }

  async handleTabUpdate(tab) {
    const domain = this.extractDomain(tab.url);
    if (!domain) return;

    // 检查访问提醒
    await this.checkVisitReminder(domain, tab.url);
    
    // 记录访问次数
    await this.recordVisit(domain);
    
    // 检查周访问频率
    await this.checkWeeklyLimit(domain);
  }

  async handleTabActivated(tabId) {
    // 记录之前标签页的浏览时长
    if (this.activeTabId && this.startTime) {
      await this.recordDuration(this.activeTabId, Date.now() - this.startTime);
    }

    // 开始记录新标签页
    this.activeTabId = tabId;
    this.startTime = Date.now();
  }

  handleWindowBlur() {
    // 窗口失去焦点，暂停计时
    if (this.activeTabId && this.startTime) {
      this.recordDuration(this.activeTabId, Date.now() - this.startTime);
      this.startTime = null;
    }
  }

  handleWindowFocus() {
    // 窗口获得焦点，重新开始计时
    if (this.activeTabId) {
      this.startTime = Date.now();
    }
  }

  async checkVisitReminder(domain, url) {
    const reminders = this.config?.visitReminders || [];
    const reminder = reminders.find(r => domain.includes(r.domain));
    
    if (reminder) {
      // 移除关键词匹配检查，直接显示提醒
      await this.showReminder(reminder.message, 'visit');
    }
  }

  async recordVisit(domain) {
    const today = new Date().toDateString();
    const visitKey = `visits_${today}`;
    
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    visits[domain] = (visits[domain] || 0) + 1;
    
    await chrome.storage.local.set({ [visitKey]: visits });
  }

  async checkWeeklyLimit(domain) {
    const limits = this.config?.weeklyLimits || [];
    const limit = limits.find(l => domain.includes(l.domain));
    
    if (limit) {
      const weeklyVisits = await this.getWeeklyVisits(domain);
      if (weeklyVisits >= limit.maxVisits) {
        await this.showReminder(limit.message, 'weekly');
      }
    }
  }

  async getWeeklyVisits(domain) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let totalVisits = 0;

    for (let d = new Date(weekAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateKey = `visits_${d.toDateString()}`;
      const result = await chrome.storage.local.get([dateKey]);
      const visits = result[dateKey] || {};
      totalVisits += visits[domain] || 0;
    }

    return totalVisits;
  }

  async recordDuration(tabId, duration) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const domain = this.extractDomain(tab.url);
      if (!domain) return;

      const today = new Date().toDateString();
      const durationKey = `duration_${today}`;
      
      const result = await chrome.storage.local.get([durationKey]);
      const durations = result[durationKey] || {};
      durations[domain] = (durations[domain] || 0) + duration;
      
      await chrome.storage.local.set({ [durationKey]: durations });
    } catch (error) {
      // 标签页可能已关闭
    }
  }

  async checkDurationLimits() {
    if (!this.activeTabId) return;

    try {
      const tab = await chrome.tabs.get(this.activeTabId);
      const domain = this.extractDomain(tab.url);
      if (!domain) return;

      const limits = this.config?.durationLimits || [];
      const limit = limits.find(l => domain.includes(l.domain));
      
      if (limit) {
        const todayDuration = await this.getTodayDuration(domain);
        const limitMs = limit.minutes * 60 * 1000;
        
        if (todayDuration >= limitMs) {
          await this.showReminder(limit.message, 'duration');
        }
      }
    } catch (error) {
      // 标签页可能已关闭
    }
  }

  async getTodayDuration(domain) {
    const today = new Date().toDateString();
    const durationKey = `duration_${today}`;
    
    const result = await chrome.storage.local.get([durationKey]);
    const durations = result[durationKey] || {};
    return durations[domain] || 0;
  }

  async showReminder(message, type) {
    // 检查是否在冷却期内
    const cooldownKey = `cooldown_${type}_${Date.now()}`;
    const cooldownResult = await chrome.storage.local.get([cooldownKey]);
    
    if (cooldownResult[cooldownKey]) {
      return; // 在冷却期内，不显示提醒
    }

    // 设置冷却期（5分钟）
    const cooldownTime = Date.now() + 5 * 60 * 1000;
    await chrome.storage.local.set({ [cooldownKey]: cooldownTime });

    // 获取当前活动标签页的域名
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const domain = this.extractDomain(tabs[0].url);
        if (domain) {
          // 获取当前域名的访问次数和浏览时长
          const visitCount = await this.getDomainVisitCount(domain);
          const durationMs = await this.getTodayDuration(domain);
          
          // 计算时长（分钟）
          const durationMinutes = Math.floor(durationMs / 60000);
          
          // 发送消息到内容脚本显示提醒
          await chrome.tabs.sendMessage(tabs[0].id, {
            type: 'showReminder',
            message: message,
            reminderType: type,
            data: {
              visitCount: visitCount,
              durationMinutes: durationMinutes
            }
          });
        }
      }
    } catch (error) {
      // 如果内容脚本不可用，使用通知API
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon48.png',
        title: 'AwareMe 提醒',
        message: message
      });
    }
  }

  async getDomainVisitCount(domain) {
    const today = new Date().toDateString();
    const visitKey = `visits_${today}`;
    
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    return visits[domain] || 0;
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }
}

// 初始化后台脚本
new AwareMeBackground();