// AwareMe 后台脚本

class AwareMeBackground {
  constructor() {
    this.activeTabId = null;
    this.startTime = null;
    this.config = null;
    this.isEnabled = true; // 默认启用插件
    this.init();
  }

  async init() {
    // 加载配置
    await this.loadConfig();
    
    // 加载插件启用状态
    await this.loadExtensionStatus();
    
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
      } else if (message.type === 'toggleExtension') {
        this.toggleExtensionStatus();
        sendResponse({ success: true, isEnabled: this.isEnabled });
      } else if (message.type === 'getExtensionStatus') {
        sendResponse({ isEnabled: this.isEnabled });
      }
    });
    
    // 监听配置变更
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.userConfig) {
        // 配置已更新，重新加载
        this.config = changes.userConfig.newValue;
        console.log('配置已更新', this.config);
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
      // 先加载默认配置
      const defaultResponse = await fetch(chrome.runtime.getURL('data/default-config.json'));
      const defaultConfig = await defaultResponse.json();
      
      // 再加载用户配置，如果有的话
      const result = await chrome.storage.local.get(['userConfig']);
      if (result.userConfig) {
        this.config = result.userConfig;
      } else {
        // 如果没有用户配置，使用默认配置
        this.config = defaultConfig;
        await chrome.storage.local.set({ userConfig: this.config });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }

  async loadExtensionStatus() {
    try {
      const result = await chrome.storage.local.get(['isEnabled']);
      if (result.hasOwnProperty('isEnabled')) {
        this.isEnabled = result.isEnabled;
      } else {
        // 如果没有设置过，默认为启用状态
        await chrome.storage.local.set({ isEnabled: true });
      }
      console.log('插件启用状态:', this.isEnabled);
    } catch (error) {
      console.error('加载插件状态失败:', error);
    }
  }

  async toggleExtensionStatus() {
    this.isEnabled = !this.isEnabled;
    await chrome.storage.local.set({ isEnabled: this.isEnabled });
    console.log('插件状态已切换:', this.isEnabled);
    return this.isEnabled;
  }

  async handleTabUpdate(tab) {
    // 检查插件是否启用
    if (!this.isEnabled) return;

    const domain = this.extractDomain(tab.url);
    if (!domain) return;

    // 检查访问提醒
    await this.checkVisitReminder(domain, tab.url);
    
    // 记录访问次数
    await this.recordVisit(domain);
    
    // 检查周访问频率
    await this.checkWeeklyLimit(domain);
    
    // 检查每日访问时长限制
    await this.checkDurationLimitOnPageLoad(domain);
  }
  
  async checkDurationLimitOnPageLoad(domain) {
    // 检查插件是否启用
    if (!this.isEnabled) return;

    const limits = this.config?.durationLimits || [];
    const limit = limits.find(l => domain.includes(l.domain));
    
    if (limit) {
      const todayDuration = await this.getTodayDuration(domain);
      const limitMs = limit.minutes * 60 * 1000;
      
      if (todayDuration >= limitMs) {
        await this.showReminder(limit.message, 'duration');
      }
    }
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
    // 检查插件是否启用
    if (!this.isEnabled) return;

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
    // 检查插件是否启用
    if (!this.isEnabled) return;

    const limits = this.config?.weeklyLimits || [];
    const limit = limits.find(l => domain.includes(l.domain));
    
    if (limit) {
      const weeklyVisits = await this.getWeeklyVisits(domain);
      if (weeklyVisits > limit.maxVisits) {
        await this.showReminder(limit.message, 'weekly');
      }
    }
  }

  async getWeeklyVisits(domain) {
    // 获取当前日期所在周的周一和周日
    const now = new Date();
    const currentDay = now.getDay(); // 0是周日，1-6是周一到周六
    
    // 计算本周的周一日期（如果今天是周日，则取上周一）
    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    monday.setHours(0, 0, 0, 0);
    
    // 计算本周的周日日期（如果今天是周日，则取今天）
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (currentDay === 0 ? 0 : 7 - currentDay));
    sunday.setHours(23, 59, 59, 999);
    
    let totalVisits = 0;

    // 从周一到周日遍历每一天
    for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
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
    // 检查插件是否启用
    if (!this.isEnabled) return;
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
    // 检查插件是否启用
    if (!this.isEnabled) return;

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