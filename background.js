// AwareMe 后台脚本

// 导入工具类
importScripts('utils.js');

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
      } else if (message.type === 'checkCurrentPage') {
        // 处理页面检查请求
        this.handlePageCheck(message.url, sender.tab);
        sendResponse({ success: true });
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
    this.config = await AwareMeUtils.loadConfig();
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

    // 页面更新时不再进行检查，因为content script会主动请求检查
    // 这避免了重复检查和记录
  }

  async getWeeklyVisitsForGroup(domains) {
    return await AwareMeStats.getWeeklyVisitDaysForGroup(domains);
  }

  async checkDurationLimitOnPageLoad(domain) {
    // 检查插件是否启用
    if (!this.isEnabled) return;

    const limits = this.config?.durationLimits || [];
    const limit = limits.find(l => l.domains && l.domains.some(d => domain.includes(d)));
    
    if (limit) {
      // 计算整个组的今日访问时长
      const todayDuration = await this.getTodayDurationForGroup(limit.domains);
      const limitMs = limit.minutes * 60 * 1000;
      
      if (todayDuration >= limitMs) {
        await this.showReminder(limit.message, 'duration', limit, todayDuration);
      }
    }
  }

  async getTodayDurationForGroup(domains) {
    return await AwareMeStats.getTodayDurationForGroup(domains);
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

  async recordDuration(tabId, duration) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const domain = AwareMeUtils.extractDomain(tab.url);
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
      const domain = AwareMeUtils.extractDomain(tab.url);
      if (!domain) return;

      const limits = this.config?.durationLimits || [];
      const limit = limits.find(l => domain.includes(l.domain));
      
      if (limit) {
        const todayDuration = await AwareMeStats.getTodayDuration(domain);
        const limitMs = limit.minutes * 60 * 1000;
        
        if (todayDuration >= limitMs) {
          await this.showReminder(limit.message, 'duration', limit, todayDuration);
        }
      }
    } catch (error) {
      // 标签页可能已关闭
    }
  }



  async showReminder(message, type, rule = null, actualValue = null) {
    console.log(`尝试显示提醒: type=${type}, message=${message}`);
    
    // 检查插件是否启用
    if (!this.isEnabled) {
      console.log('插件未启用，跳过提醒');
      return;
    }

    try {
      // 获取当前标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        console.log('没有找到活动标签页');
        return;
      }
      
      const tab = tabs[0];
      const domain = AwareMeUtils.extractDomain(tab.url);
      
      // 准备数据对象
      let data = { rule: rule };
      
      // 根据提醒类型设置相应的数据，优先使用实际计算值
      if (type === 'duration' && rule) {
        if (actualValue !== null) {
          // 使用实际计算的时长（转换为分钟）
          data.durationMinutes = Math.round(actualValue / (1000 * 60));
        } else {
          data.durationMinutes = rule.minutes;
        }
      } else if (type === 'weekly' && rule) {
        if (actualValue !== null) {
          // 使用实际计算的访问天数
          data.visitCount = actualValue;
        } else {
          data.visitCount = rule.maxVisits;
        }
      }
      
      console.log(`发送提醒到标签页 ${tab.id}: ${message}`, data);
      
      // 发送消息到内容脚本显示提醒
      chrome.tabs.sendMessage(tab.id, {
        type: 'showReminder',
        message: message,
        reminderType: type,
        data: data
      });
    } catch (error) {
      console.error('显示提醒失败:', error);
      // 如果内容脚本不可用，使用通知API
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon16.png',  // 暂时使用现有图标
        title: 'AwareMe 提醒',
        message: message
      });
    }
  }



  async handlePageCheck(url, tab) {
    // 检查插件是否启用
    if (!this.isEnabled) {
      // 插件未启用，允许访问
      chrome.tabs.sendMessage(tab.id, { type: 'pageAllowed' });
      return;
    }

    const domain = AwareMeUtils.extractDomain(url);
    if (!domain) {
      // 无法提取域名，允许访问
      chrome.tabs.sendMessage(tab.id, { type: 'pageAllowed' });
      return;
    }

    // 执行各种检查
    const checkResult = await this.performAccessChecks(domain);
    
    if (checkResult.shouldBlock) {
      // 显示相应的提醒
      await this.showReminder(checkResult.message, checkResult.type, checkResult.rule, checkResult.actualValue);
      return;
    }

    // 没有任何限制或提醒，允许访问
    chrome.tabs.sendMessage(tab.id, { type: 'pageAllowed' });
    
    // 记录访问（在允许访问后）
    await this.recordVisitWithWeeklyTracking(domain);
  }

  /**
   * 执行所有访问检查
   * @param {string} domain - 域名
   * @returns {Object} - 检查结果
   */
  async performAccessChecks(domain) {
    // 检查访问提醒
    const visitReminderResult = await this.checkVisitReminderRule(domain);
    if (visitReminderResult.shouldBlock) {
      return visitReminderResult;
    }

    // 检查时长限制
    const durationLimitResult = await this.checkDurationLimitRule(domain);
    if (durationLimitResult.shouldBlock) {
      return durationLimitResult;
    }

    // 检查周访问限制
    const weeklyLimitResult = await this.checkWeeklyLimitRule(domain);
    if (weeklyLimitResult.shouldBlock) {
      return weeklyLimitResult;
    }

    return { shouldBlock: false };
  }

  /**
   * 检查访问提醒规则
   * @param {string} domain - 域名
   * @returns {Object} - 检查结果
   */
  async checkVisitReminderRule(domain) {
    const reminders = this.config?.visitReminders || [];
    const reminder = reminders.find(r => r.domains && r.domains.some(d => domain.includes(d)));
    
    if (reminder) {
      return {
        shouldBlock: true,
        message: reminder.message,
        type: 'visit',
        rule: reminder
      };
    }

    return { shouldBlock: false };
  }

  /**
   * 检查时长限制规则
   * @param {string} domain - 域名
   * @returns {Object} - 检查结果
   */
  async checkDurationLimitRule(domain) {
    const durationLimits = this.config?.durationLimits || [];
    const durationLimit = durationLimits.find(r => r.domains && r.domains.some(d => domain.includes(d)));
    
    if (durationLimit) {
      // 计算整个组的今日访问时长
      const todayDuration = await this.getTodayDurationForGroup(durationLimit.domains);
      const limitMs = durationLimit.minutes * 60 * 1000;
      
      if (todayDuration >= limitMs) {
        return {
          shouldBlock: true,
          message: durationLimit.message,
          type: 'duration',
          rule: durationLimit,
          actualValue: todayDuration
        };
      }
    }

    return { shouldBlock: false };
  }

  /**
   * 检查周访问限制规则
   * @param {string} domain - 域名
   * @returns {Object} - 检查结果
   */
  async checkWeeklyLimitRule(domain) {
    const weeklyLimits = this.config?.weeklyLimits || [];
    const weeklyLimit = weeklyLimits.find(r => r.domains && r.domains.some(d => domain.includes(d)));
    
    if (weeklyLimit) {
      // 计算整个组的本周访问天数
      const weeklyVisitedDays = await this.getWeeklyVisitsForGroup(weeklyLimit.domains);
      
      // 检查今天是否已经访问过组内任何域名
      // const hasVisitedTodayInGroup = await this.hasVisitedTodayInGroup(weeklyLimit.domains);
      
      // 如果访问天数已达到限制，则阻止访问
      if (weeklyVisitedDays >= weeklyLimit.maxVisits) {
        return {
          shouldBlock: true,
          message: weeklyLimit.message,
          type: 'weekly',
          rule: weeklyLimit,
          actualValue: weeklyVisitedDays
        };
      }
    }

    return { shouldBlock: false };
  }

  /**
   * 检查今天是否已访问过组内任何域名
   * @param {Array} domains - 域名组
   * @returns {boolean} - 是否已访问
   */
  async hasVisitedTodayInGroup(domains) {
    const today = new Date().toDateString();
    const visitKey = `visits_${today}`;
    
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    
    return domains.some(domain => visits[domain] && visits[domain] > 0);
  }

  /**
   * 记录访问并更新周访问跟踪
   * @param {string} domain - 域名
   */
  async recordVisitWithWeeklyTracking(domain) {
    // 记录日访问
    await AwareMeStats.recordVisit(domain);
    
    // 更新周访问跟踪
    await this.updateWeeklyVisitTracking(domain);
  }

  /**
   * 更新周访问跟踪数据
   * @param {string} domain - 域名
   */
  async updateWeeklyVisitTracking(domain) {
    const { monday } = AwareMeUtils.getWeekRange();
    const weekStart = monday.toDateString();
    const today = new Date().toDateString();
    
    // 检查今天是否是本周第一次访问该域名
    const visitKey = `visits_${today}`;
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    
    // 如果今天是第一次访问该域名，更新周访问计数
    if (visits[domain] === 1) {
      const weeklyKey = `weekly_${domain}_${weekStart}`;
      const weeklyResult = await chrome.storage.local.get([weeklyKey]);
      const weeklyVisits = weeklyResult[weeklyKey] || 0;
      
      await chrome.storage.local.set({ [weeklyKey]: weeklyVisits + 1 });
      console.log(`更新周访问跟踪: ${domain}, 周开始: ${weekStart}, 访问天数: ${weeklyVisits + 1}`);
    }
  }
}

// 初始化后台脚本
new AwareMeBackground();