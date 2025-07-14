// AwareMe 后台脚本

// 导入工具类
importScripts('utils.js');

class AwareMeBackground {
  constructor() {
    this.activeTabId = null;
    this.startTime = null;
    this.currentUrl = null; // 跟踪当前活跃标签页的URL
    this.config = null;
    this.isEnabled = true; // 默认启用插件
    this.init();
  }

  async init() {
    console.log(`[时长统计] 插件初始化开始`);
    
    // 标记初始化状态
    console.log(`[时长统计] 标记初始化状态`);
    this.isInitializing = true;
    this.initializationPromise = this.performInitialization();
    
    // 监听来自内容脚本的消息
    console.log(`[时长统计] 设置消息监听器`);
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
    console.log(`[时长统计] 设置配置变更监听器`);
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.userConfig) {
        // 配置已更新，重新加载
        this.config = changes.userConfig.newValue;
        console.log('配置已更新', this.config);
      }
    });
    
    // 监听标签页更新
    console.log(`[时长统计] 设置标签页更新监听器`);
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tab);
      }
    });

    // 监听标签页激活
    console.log(`[时长统计] 设置标签页激活监听器`);
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabActivated(activeInfo.tabId);
    });

    // 监听标签页关闭
    console.log(`[时长统计] 设置标签页关闭监听器`);
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabRemoved(tabId);
    });

    // 监听窗口焦点变化
    console.log(`[时长统计] 设置窗口焦点变化监听器`);
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.handleWindowBlur();
      } else {
        this.handleWindowFocus();
      }
    });

    // 定时检查浏览时长
    console.log(`[时长统计] 设置定时检查浏览时长`);
    setInterval(() => {
      this.checkDurationLimits();
    }, 40000); // 40s检查一次
    
    // 立即执行一次检查以验证功能
    console.log(`[时长统计] 立即执行一次时长检查以验证功能`);
    setTimeout(() => {
      this.checkDurationLimits();
    }, 5000); // 5秒后执行一次
    
    // 定时清理旧记录（每小时检查一次）
    console.log(`[时长统计] 设置定时清理旧记录`);
    setInterval(() => {
      this.cleanupOldRecords();
    }, 3600000); // 每小时检查一次
    
    // 获取当前活跃标签页
    console.log(`[时长统计] 获取当前活跃标签页`);
    this.getCurrentActiveTab();
    
    console.log(`[时长统计] 插件初始化完成`);
  }

  // 获取当前活跃标签页
  getCurrentActiveTab() {
    console.log(`[时长统计] 获取当前活跃标签页`);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        console.log(`[时长统计] 找到活跃标签页: ID=${tabs[0].id}, URL=${tabs[0].url}`);
        this.activeTabId = tabs[0].id;
        this.currentUrl = tabs[0].url;
        this.startTime = Date.now();
        console.log(`[时长统计] 设置活跃标签页状态完成`);
      } else {
        console.log(`[时长统计] 未找到活跃标签页`);
      }
    });
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
          durationLimits: [],
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
          durationLimits: [],
          weeklyLimits: []
        };
      }
    }
    
    // 预热缓存：在第一次访问时预先加载今日的访问和时长数据
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
    console.log('活跃标签页ID:', this.activeTabId);
    console.log('当前URL:', this.currentUrl);
    console.log('开始时间:', this.startTime);
    console.log('配置加载状态:', !!this.config);
    if (this.config) {
      console.log('时长限制规则数量:', this.config.durationLimits?.length || 0);
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

  async handleTabUpdate(tab) {
    // 检查插件是否启用
    if (!this.isEnabled) return;

    console.log(`[时长统计] 标签页更新: ${tab.id}, 新URL: ${tab.url}, 当前URL: ${this.currentUrl}`);
    
    // 如果是当前活跃标签页且URL发生变化，记录之前页面的浏览时长
    if (this.activeTabId === tab.id && this.startTime && this.currentUrl && this.currentUrl !== tab.url) {
      const duration = Date.now() - this.startTime;
      console.log(`[时长统计] URL变化，记录之前页面时长: ${this.currentUrl}, 时长: ${Math.round(duration/1000)}秒`);
      await this.recordDurationForUrl(this.currentUrl, duration);
      // 更新当前URL并重新开始计时新页面
      this.currentUrl = tab.url;
      this.startTime = Date.now();
      console.log(`[时长统计] 开始记录新页面: ${tab.url}`);
    }

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
    console.log(`[时长统计] 计算组时长，域名列表: ${domains.join(', ')}`);
    
    const today = new Date().toDateString();
    const durationKey = `duration_${today}`;
    console.log(`[时长统计] 查询存储键: ${durationKey}`);
    
    const result = await chrome.storage.local.get([durationKey]);
    const durations = result[durationKey] || {};
    console.log(`[时长统计] 当前存储的时长数据:`, durations);
    
    let totalDuration = 0;
    for (const domain of domains) {
      const domainDuration = durations[domain] || 0;
      console.log(`[时长统计] 域名 ${domain} 时长: ${Math.round(domainDuration/1000)}秒`);
      totalDuration += domainDuration;
    }
    
    console.log(`[时长统计] 组总时长: ${Math.round(totalDuration/1000)}秒`);
    return totalDuration;
  }

  async handleTabActivated(tabId) {
    console.log(`[时长统计] 标签页激活: ${tabId}`);
    
    // 记录之前标签页的浏览时长
    if (this.activeTabId && this.startTime && this.currentUrl) {
      const duration = Date.now() - this.startTime;
      console.log(`[时长统计] 切换标签页，记录之前页面时长: ${this.currentUrl}, 时长: ${Math.round(duration/1000)}秒`);
      await this.recordDurationForUrl(this.currentUrl, duration);
    }

    // 开始记录新标签页
    try {
      const tab = await chrome.tabs.get(tabId);
      this.activeTabId = tabId;
      this.currentUrl = tab.url;
      this.startTime = Date.now();
      console.log(`[时长统计] 开始记录新标签页: ${tab.url}`);
    } catch (error) {
      console.error('获取标签页信息失败:', error);
    }
  }

  async handleTabRemoved(tabId) {
    console.log(`[时长统计] 标签页关闭: ${tabId}`);
    
    // 如果关闭的是当前活跃标签页，记录时长
    if (this.activeTabId === tabId && this.startTime && this.currentUrl) {
      const duration = Date.now() - this.startTime;
      console.log(`[时长统计] 关闭活跃标签页，记录时长: ${this.currentUrl}, 时长: ${Math.round(duration/1000)}秒`);
      await this.recordDurationForUrl(this.currentUrl, duration);
      
      console.log(`[时长统计] 清除活跃标签页状态`);
      this.activeTabId = null;
      this.currentUrl = null;
      this.startTime = null;
    }
  }

  handleWindowBlur() {
    console.log(`[时长统计] 窗口失去焦点`);
    
    // 窗口失去焦点，暂停计时
    if (this.activeTabId && this.startTime && this.currentUrl) {
      const duration = Date.now() - this.startTime;
      console.log(`[时长统计] 窗口失焦，记录时长: ${this.currentUrl}, 时长: ${Math.round(duration/1000)}秒`);
      this.recordDurationForUrl(this.currentUrl, duration);
      
      console.log(`[时长统计] 清除窗口状态`);
      this.activeTabId = null;
      this.currentUrl = null;
      this.startTime = null;
    }
  }

  handleWindowFocus() {
    console.log(`[时长统计] 窗口获得焦点`);
    
    // 窗口获得焦点，重新开始计时
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        this.activeTabId = tabs[0].id;
        this.currentUrl = tabs[0].url;
        this.startTime = Date.now();
        console.log(`[时长统计] 窗口获焦，开始记录: ${tabs[0].url}`);
      }
    });
  }

  async recordDuration(tabId, duration) {
    try {
      // 忽略过短的时长记录（小于1秒）
      if (duration < 1000) return;
      
      const tab = await chrome.tabs.get(tabId);
      const domain = AwareMeUtils.extractDomain(tab.url);
      
      if (!domain) return;

      const today = new Date().toDateString();
      const durationKey = `duration_${today}`;
      
      const result = await chrome.storage.local.get([durationKey]);
      const durations = result[durationKey] || {};
      const previousDuration = durations[domain] || 0;
      durations[domain] = previousDuration + duration;
      
      await chrome.storage.local.set({ [durationKey]: durations });
      
      console.log(`记录浏览时长: ${domain}, 本次: ${Math.round(duration/1000)}秒, 今日总计: ${Math.round(durations[domain]/1000)}秒`);
    } catch (error) {
      console.error('记录浏览时长失败:', error);
      // 标签页可能已关闭，这是正常情况
    }
  }

  async recordDurationForUrl(url, duration) {
    console.log(`[时长统计] recordDurationForUrl 调用: URL=${url}, 时长=${Math.round(duration/1000)}秒`);
    
    try {
      // 忽略过短的时长记录（小于1秒）
      if (duration < 1000) {
        console.log(`[时长统计] 忽略短时长: ${Math.round(duration/1000)}秒`);
        return;
      }
      
      const domain = AwareMeUtils.extractDomain(url);
      
      if (!domain) {
        console.log(`[时长统计] 无法提取域名: ${url}`);
        return;
      }
      
      console.log(`[时长统计] 提取域名: ${domain}`);

      const today = new Date().toDateString();
      const durationKey = `duration_${today}`;
      console.log(`[时长统计] 存储键: ${durationKey}`);
      
      const result = await chrome.storage.local.get([durationKey]);
      const durations = result[durationKey] || {};
      const previousDuration = durations[domain] || 0;
      console.log(`[时长统计] ${domain} 当前累计时长: ${Math.round(previousDuration/1000)}秒`);
      
      durations[domain] = previousDuration + duration;
      console.log(`[时长统计] ${domain} 更新后时长: ${Math.round(durations[domain]/1000)}秒`);
      
      await chrome.storage.local.set({ [durationKey]: durations });
      
      console.log(`[时长统计] 存储完成: ${domain}, 本次: ${Math.round(duration/1000)}秒, 今日总计: ${Math.round(durations[domain]/1000)}秒`);
    } catch (error) {
      console.error('[时长统计] 记录浏览时长失败:', error);
    }
  }

  async checkDurationLimits() {
    const timestamp = new Date().toLocaleTimeString();
      
    console.log(`[时长统计] ${timestamp} 开始检查时长限制`);
    console.log(`[时长统计] 当前状态 - 插件启用: ${this.isEnabled}, 活跃标签页ID: ${this.activeTabId}, 初始化中: ${this.isInitializing}`);
    
    // 检查插件是否启用
    if (!this.isEnabled) {
      console.log(`[时长统计] 插件未启用，跳过检查`);
      return;
    }
    if (!this.activeTabId) {
      console.log(`[时长统计] 没有活跃标签页，跳过检查`);
      return;
    }
    
    // 检查是否还在初始化中
    if (this.isInitializing) {
      console.log(`[时长统计] 插件仍在初始化中，跳过检查`);
      return;
    }

    // 在检查限制前，先更新当前活跃标签页的时间记录
    // 这确保了时间统计的准确性，避免因为用户长时间停留在同一页面而导致时间不更新
    if (this.activeTabId && this.startTime && this.currentUrl) {
      const currentDuration = Date.now() - this.startTime;
      if (currentDuration >= 1000) { // 只记录超过1秒的时长
        console.log(`[时长统计] 更新当前页面时长: ${this.currentUrl}, 时长: ${Math.round(currentDuration/1000)}秒`);
        await this.recordDurationForUrl(this.currentUrl, currentDuration);
        // 重置开始时间，避免重复计算
        this.startTime = Date.now();
      }
    }

    try {
      const tab = await chrome.tabs.get(this.activeTabId);
      const domain = AwareMeUtils.extractDomain(tab.url);
      if (!domain) {
        console.log(`[时长统计] 无法提取域名: ${tab.url}`);
        return;
      }
      
      console.log(`[时长统计] 当前域名: ${domain}`);

      const limits = this.config?.durationLimits || [];
      console.log(`[时长统计] 配置的时长限制数量: ${limits.length}`);
      
      const limit = limits.find(l => {
        const isEnabled = l.status !== false;
        const hasDomains = l.domains && l.domains.length > 0;
        const domainMatches = hasDomains && l.domains.some(d => domain.includes(d));
        
        console.log(`[时长统计] 检查限制规则: 启用=${isEnabled}, 有域名=${hasDomains}, 域名匹配=${domainMatches}, 规则域名=[${l.domains?.join(', ')}]`);
        
        return isEnabled && hasDomains && domainMatches;
      });
      
      if (limit) {
        console.log(`[时长统计] 找到匹配的限制规则: ${limit.minutes}分钟, 域名=[${limit.domains.join(', ')}]`);
        
        // 计算整个组的今日访问时长
        const todayDuration = await this.getTodayDurationForGroup(limit.domains);
        const limitMs = limit.minutes * 60 * 1000;
        
        console.log(`[时长统计] 今日时长: ${Math.round(todayDuration/60000)}分钟, 限制: ${limit.minutes}分钟`);
        
        if (todayDuration >= limitMs) {
          console.log(`[时长统计] 超出时长限制，显示提醒`);
          await this.showReminder(limit.message, 'duration', limit, todayDuration);
        } else {
          console.log(`[时长统计] 未超出时长限制`);
        }
      } else {
        console.log(`[时长统计] 未找到匹配的限制规则`);
      }
    } catch (error) {
      // 标签页可能已关闭
      console.error('[时长统计] 检查时长限制失败:', error);
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
      this.sendMessageToTab(tab.id, {
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
          
          // 如果是端口关闭错误且重试次数少于2次，尝试重试
          if (errorMsg.includes('port closed') && retryCount < 2) {
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
    
    // 执行各种检查
    const checkResult = await this.performAccessChecks(domain);
    
    if (checkResult.shouldBlock) {
      console.log(`域名 ${domain} 被阻止:`, checkResult);
      // 显示相应的提醒
      await this.showReminder(checkResult.message, checkResult.type, checkResult.rule, checkResult.actualValue);
      return;
    }

    console.log(`域名 ${domain} 允许访问`);
    // 没有任何限制或提醒，允许访问
    this.sendMessageToTab(tab.id, { type: 'pageAllowed' });
    
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
   * 检查时长限制规则
   * @param {string} domain - 域名
   * @returns {Object} - 检查结果
   */
  async checkDurationLimitRule(domain) {
    const durationLimits = this.config?.durationLimits || [];
    const durationLimit = durationLimits.find(r => r.domains && r.domains.some(d => domain.includes(d)));
    
    if (durationLimit && durationLimit.status !== false) {
      // 在检查限制前，先更新当前活跃标签页的时间记录
      // 确保时间统计的实时性，避免因为用户长时间停留在同一页面而导致时间不更新
      if (this.activeTabId && this.startTime && this.currentUrl) {
        const currentDuration = Date.now() - this.startTime;
        if (currentDuration >= 1000) { // 只记录超过1秒的时长
          console.log(`[页面检查] 更新当前页面时长: ${this.currentUrl}, 时长: ${Math.round(currentDuration/1000)}秒`);
          await this.recordDurationForUrl(this.currentUrl, currentDuration);
          // 重置开始时间，避免重复计算
          this.startTime = Date.now();
        }
      }
      
      // 计算整个组的今日访问时长
      const todayDuration = await this.getTodayDurationForGroup(durationLimit.domains);
      const limitMs = durationLimit.minutes * 60 * 1000;
      
      console.log(`[页面检查] 域名 ${domain} 时长检查: 组时长=${Math.round(todayDuration/60000)}分钟, 限制=${durationLimit.minutes}分钟`);
      
      if (todayDuration >= limitMs) {
        console.log(`[页面检查] 域名 ${domain} 超出时长限制，阻止访问`);
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

  /**
   * 预热今日缓存数据
   * 在第一次访问时预先加载今日的访问和时长数据到内存
   */
  async preloadTodayCache() {
    try {
      const today = new Date().toDateString();
      const visitKey = `visits_${today}`;
      const durationKey = `duration_${today}`;
      
      // 预先加载今日数据，确保后续读取不会因为缓存未命中而延迟
      const result = await chrome.storage.local.get([visitKey, durationKey]);
      
      // 如果数据不存在，创建空的数据结构
      const updates = {};
      if (!result[visitKey]) {
        updates[visitKey] = {};
      }
      if (!result[durationKey]) {
        updates[durationKey] = {};
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
          时长记录: result.durationRecordsDeleted,
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

// 暴露调试函数到全局作用域，方便在控制台调用
// 用法：在Chrome扩展的Service Worker控制台中输入 debugAwareMe() 来查看插件状态
globalThis.debugAwareMe = () => {
  if (awareMeBackground) {
    awareMeBackground.debugStatus();
  } else {
    console.log('AwareMe 插件实例未找到');
  }
};

// 暴露手动触发时长检查的函数
globalThis.checkDurationLimitsNow = () => {
  if (awareMeBackground) {
    console.log('手动触发时长检查...');
    awareMeBackground.checkDurationLimits();
  } else {
    console.log('AwareMe 插件实例未找到');
  }
};

console.log('AwareMe 调试函数已加载，可以使用 debugAwareMe() 和 checkDurationLimitsNow() 进行调试');