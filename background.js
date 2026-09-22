// AwareMe 后台脚本

// 导入工具类
importScripts('utils.js');

class AwareMeBackground {
  constructor() {
    this.config = null;
    this.isEnabled = true; // 默认启用插件

    this.init();
  }

  async init() {
    // 标记初始化状态
    this.isInitializing = true;
    this.initializationPromise = this.performInitialization();
    
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
      } else if (message.type === 'cleanupOldRecords') {
        // 处理清理旧记录请求
        this.cleanupOldRecords()
          .then((result) => {
            sendResponse({ success: true, result });
          })
          .catch((error) => {
            console.error('清理旧记录失败:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // 异步响应
      } else if (message.type === 'checkCurrentPage') {
        // 处理页面检查请求 - 确保初始化完成后再处理
        console.log('收到页面检查请求:', message.url, '初始化状态:', this.isInitializing);
        this.handlePageCheckWithInit(message.url, sender.tab)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error('页面检查处理失败:', error);
            // 即使处理失败，也要发送响应避免content script等待超时
            sendResponse({ success: false, error: error.message });
          });
        // 返回true表示异步处理响应
        return true;
      }
      
      // 返回true表示异步处理响应
      return true;
    });
    
    // 监听配置变更
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.userConfig) {
        // 配置已更新，重新加载
        this.config = changes.userConfig.newValue;
        console.log('配置已更新', this.config);
      }
    });

    // 定时清理旧记录（每小时检查一次）
    setInterval(() => {
      this.cleanupOldRecords();
    }, 3600000); // 每小时检查一次

    console.log('AwareMe 后台脚本初始化完成');
  }

  async performInitialization() {
    try {
      console.log('AwareMe Background 开始初始化');
      
      // 并行加载配置和插件状态，提高初始化速度
      const [configResult, statusResult] = await Promise.allSettled([
        this.loadConfig(),
        this.loadExtensionStatus()
      ]);
      
      if (configResult.status === 'rejected') {
        console.error('加载配置失败:', configResult.reason);
      }
      
      if (statusResult.status === 'rejected') {
        console.error('加载插件状态失败:', statusResult.reason);
      }
      
      this.isInitializing = false;
      console.log('AwareMe Background 初始化完成', {
        configLoaded: !!this.config,
        isEnabled: this.isEnabled
      });
      
      // 预热今日缓存数据
      this.preloadTodayCache();
      
      // 初始化完成后立即执行一次清理（异步执行，不阻塞）
      this.cleanupOldRecords().catch(error => {
        console.error('清理旧记录失败:', error);
      });
    } catch (error) {
      console.error('AwareMe Background 初始化失败:', error);
      this.isInitializing = false;
      // 即使初始化失败，也要设置默认状态
      if (!this.config) {
        this.config = {
          visitReminders: [],
          weeklyLimits: []
        };
      }
      this.isEnabled = true;
      console.log('AwareMe Background 使用默认配置完成初始化');
    }
  }

  async loadConfig() {
    this.config = await AwareMeUtils.loadConfig();
  }

  async handlePageCheckWithInit(url, tab) {
    // 等待初始化完成
    if (this.isInitializing) {
      try {
        // 设置初始化超时，避免无限等待
        const initTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('初始化超时')), 10000); // 10秒超时
        });
        
        await Promise.race([this.initializationPromise, initTimeout]);
      } catch (error) {
        console.error('等待初始化完成时出错:', error);
        // 初始化超时或失败时，强制完成初始化
        this.isInitializing = false;
      }
    }
    
    // 如果初始化失败或配置未加载，重新尝试加载配置
    if (!this.config) {
      console.log('配置未加载，重新尝试加载');
      try {
        await this.loadConfig();
      } catch (error) {
        console.error('重新加载配置失败:', error);
        // 设置默认配置，确保插件可以正常工作
        this.config = {
          visitReminders: [],
          weeklyLimits: []
        };
      }
    }

    // 预热缓存：在第一次访问时预先加载今日的访问数据
    await this.preloadTodayCache();
    
    // 执行页面检查
    await this.handlePageCheck(url, tab);
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
  
  // 调试函数：检查插件当前状态
  debugStatus() {
    console.log('=== AwareMe 插件状态调试信息 ===');
    console.log('插件启用状态:', this.isEnabled);
    console.log('初始化状态:', this.isInitializing);
    console.log('配置加载状态:', !!this.config);
    if (this.config) {
      console.log('访问提醒规则数量:', this.config.visitReminders?.length || 0);
      console.log('周限制规则数量:', this.config.weeklyLimits?.length || 0);
    }
    console.log('================================');
  }

  async toggleExtensionStatus() {
    this.isEnabled = !this.isEnabled;
    await chrome.storage.local.set({ isEnabled: this.isEnabled });
    console.log('插件状态已切换:', this.isEnabled);
    return this.isEnabled;
  }

  async getWeeklyVisitsForGroup(domains) {
    return await AwareMeStats.getWeeklyVisitDaysForGroup(domains);
  }

  async showReminder(message, type, rule = null, actualValue = null, targetTabId = null) {
    console.log(`尝试显示提醒: type=${type}, message=${message}`);

    // 检查插件是否启用
    if (!this.isEnabled) {
      console.log('插件未启用，跳过提醒');
      return;
    }

    try {
      // 优先发送到发起检查的标签页，避免弹窗广告抢占焦点时提醒发到错误的标签页
      let tabId = targetTabId;
      if (tabId == null) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
          console.log('没有找到活动标签页');
          return;
        }
        tabId = tabs[0].id;
      }

      // 准备数据对象
      let data = { rule: rule };

      // 根据提醒类型设置相应的数据，优先使用实际计算值
      if (type === 'weekly' && rule) {
        if (actualValue !== null) {
          // 使用实际计算的访问天数
          data.visitCount = actualValue;
        } else {
          data.visitCount = rule.maxVisits;
        }
      }

      console.log(`发送提醒到标签页 ${tabId}: ${message}`, data);

      // 发送消息到内容脚本显示提醒
      this.sendMessageToTab(tabId, {
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

  /**
   * 安全地向标签页发送消息，处理连接错误
   * @param {number} tabId - 标签页ID
   * @param {Object} message - 要发送的消息
   * @param {number} retryCount - 重试次数（内部使用）
   */
  async sendMessageToTab(tabId, message, retryCount = 0) {
    try {
      // 首先检查标签页是否仍然存在
      try {
        await chrome.tabs.get(tabId);
      } catch (tabError) {
        console.log(`标签页 ${tabId} 不存在，跳过消息发送`);
        return;
      }

      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          console.log(`向标签页 ${tabId} 发送消息失败: ${errorMsg}`);
          
          // 如果是端口关闭或接收端未就绪错误且重试次数少于2次，尝试重试
          if ((errorMsg.includes('port closed') || errorMsg.includes('Receiving end does not exist')) && retryCount < 2) {
            console.log(`准备重试发送消息到标签页 ${tabId}，重试次数: ${retryCount + 1}`);
            setTimeout(() => {
              this.sendMessageToTab(tabId, message, retryCount + 1);
            }, 500); // 延迟500ms后重试
          }
          // 不抛出错误，避免影响其他功能
        } else {
          console.log(`向标签页 ${tabId} 发送消息成功:`, message.type);
        }
      });
    } catch (error) {
      console.error(`向标签页 ${tabId} 发送消息异常:`, error);
    }
  }



  async handlePageCheck(url, tab) {
    console.log(`处理页面检查: ${url}`);
    
    // 检查插件是否启用
    if (!this.isEnabled) {
      console.log('插件未启用，允许访问');
      this.sendMessageToTab(tab.id, { type: 'pageAllowed' });
      return;
    }

    const domain = AwareMeUtils.extractDomain(url);
    if (!domain) {
      console.log('无法提取域名，允许访问');
      this.sendMessageToTab(tab.id, { type: 'pageAllowed' });
      return;
    }

    // 检查配置是否已加载
    if (!this.config) {
      console.log('配置未加载，允许访问');
      this.sendMessageToTab(tab.id, { type: 'pageAllowed' });
      return;
    }

    console.log(`检查域名: ${domain}`);
    
    // 先记录访问，确保缓存中有数据供检查使用
    await this.recordVisitWithWeeklyTracking(domain);
    
    // 执行各种检查
    const checkResult = await this.performAccessChecks(domain);
    
    if (checkResult.shouldBlock) {
      console.log(`域名 ${domain} 被阻止:`, checkResult);
      // 显示相应的提醒（发送到被检查的标签页，而非当前活动标签页，防止弹窗广告抢焦点导致拦截失效）
      await this.showReminder(checkResult.message, checkResult.type, checkResult.rule, checkResult.actualValue, tab.id);
      return;
    }

    console.log(`域名 ${domain} 允许访问`);
    // 没有任何限制或提醒，允许访问
    this.sendMessageToTab(tab.id, { type: 'pageAllowed' });
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
    
    if (reminder && reminder.status !== false) {
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
   * 检查周访问限制规则
   * @param {string} domain - 域名
   * @returns {Object} - 检查结果
   */
  async checkWeeklyLimitRule(domain) {
    const weeklyLimits = this.config?.weeklyLimits || [];
    const weeklyLimit = weeklyLimits.find(r => r.domains && r.domains.some(d => domain.includes(d)));
    
    if (weeklyLimit && weeklyLimit.status !== false) {
      // 计算整个组的本周访问天数
      const weeklyVisitedDays = await this.getWeeklyVisitsForGroup(weeklyLimit.domains);
      
      // 检查今天是否已经访问过组内任何域名
      // const hasVisitedTodayInGroup = await this.hasVisitedTodayInGroup(weeklyLimit.domains);
      
      // 如果访问天数已达到限制，则阻止访问
      if (weeklyVisitedDays > weeklyLimit.maxVisits) {
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
    
    return domains.some(pattern => AwareMeUtils.fuzzyAnyByPattern(visits, pattern));
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

  /**
   * 预热今日缓存数据
   * 在第一次访问时预先加载今日的访问数据到内存
   */
  async preloadTodayCache() {
    try {
      const today = new Date().toDateString();
      const visitKey = `visits_${today}`;
      
      // 预先加载今日数据，确保后续读取不会因为缓存未命中而延迟
      const result = await chrome.storage.local.get([visitKey]);
      
      // 如果数据不存在，创建空的数据结构
      const updates = {};
      if (!result[visitKey]) {
        updates[visitKey] = {};
      }
      
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
        console.log('预热今日缓存完成:', Object.keys(updates));
      }
    } catch (error) {
      console.error('预热缓存失败:', error);
      // 预热失败不应该影响正常功能
    }
  }

  /**
   * 清理非本周的访问记录
   */
  async cleanupOldRecords() {
    try {
      const result = await AwareMeStats.cleanupOldRecords();
      if (result.totalDeleted > 0) {
        console.log(`清理完成: 删除了 ${result.totalDeleted} 条记录`, {
          访问记录: result.visitRecordsDeleted,
          周访问记录: result.weeklyRecordsDeleted
        });
      }
      return result;
    } catch (error) {
      console.error('清理旧记录失败:', error);
      throw error;
    }
  }
}

// 初始化后台脚本
const awareMeBackground = new AwareMeBackground();

// 初始化插件
awareMeBackground.init();

// 暴露调试函数到全局作用域，方便在控制台调用
globalThis.debugAwareMe = () => {
  if (awareMeBackground) {
    awareMeBackground.debugStatus();
  } else {
    console.log('AwareMe 插件实例未找到');
  }
};

console.log('AwareMe 调试函数已加载，可以使用 debugAwareMe() 进行调试');