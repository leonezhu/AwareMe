// AwareMe 通用工具类
class AwareMeUtils {
  /**
   * 提取域名（统一逻辑）
   * @param {string} url - 完整URL
   * @returns {string|null} - 提取的域名
   */
  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // 提取一级域名（如从www.bilibili.com提取bilibili.com）
      const domainParts = hostname.split('.');
      
      // 如果只有两部分或更少（如bilibili.com或localhost），直接返回
      if (domainParts.length <= 2) {
        return hostname;
      }
      
      // 否则返回最后两部分（如从www.bilibili.com返回bilibili.com）
      return domainParts.slice(-2).join('.');
    } catch {
      return null;
    }
  }

  /**
   * 获取本周的周一和周日日期
   * @returns {Object} - {monday: Date, sunday: Date}
   */
  static getWeekRange() {
    const now = new Date();
    const currentDay = now.getDay(); // 0是周日，1-6是周一到周六
    
    // 获取本周的周一日期
    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    monday.setHours(0, 0, 0, 0);
    
    // 获取本周的周日日期
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (currentDay === 0 ? 0 : 7 - currentDay));
    sunday.setHours(23, 59, 59, 999);
    
    return { monday, sunday };
  }

  /**
   * 检查域名是否在配置中
   * @param {string} domain - 要检查的域名
   * @param {Object} config - 用户配置
   * @returns {boolean} - 是否在配置中
   */
  static isDomainConfigured(domain, config) {
    if (!config || !domain) return false;
    
    const allConfiguredDomains = [];
    
    // 收集所有配置中的域名
    if (config.visitReminders) {
      config.visitReminders.forEach(reminder => {
        if (reminder.domains) {
          allConfiguredDomains.push(...reminder.domains);
        }
      });
    }
    
    if (config.weeklyLimits) {
      config.weeklyLimits.forEach(limit => {
        if (limit.domains) {
          allConfiguredDomains.push(...limit.domains);
        }
      });
    }

    // 检查当前域名是否匹配任何配置的域名（支持关键词模糊匹配）
    return allConfiguredDomains.some(configDomain => domain.includes(configDomain));
  }

  /**
   * 在存储数据中检查是否有任何域名匹配关键词且有数据
   * @param {Object} data - 存储数据对象 {actualDomain: value}
   * @param {string} pattern - 配置的关键词或域名
   * @returns {boolean}
   */
  static fuzzyAnyByPattern(data, pattern) {
    if (!data || !pattern) return false;
    return Object.keys(data).some(key => key.includes(pattern) && data[key] > 0);
  }

  /**
   * 获取配置中的所有域名
   * @param {Object} config - 用户配置
   * @returns {Array} - 所有配置的域名列表
   */
  static getAllConfiguredDomains(config) {
    if (!config) return [];
    
    const allDomains = new Set();
    
    // 收集所有配置中的域名
    if (config.visitReminders) {
      config.visitReminders.forEach(reminder => {
        if (reminder.domains) {
          reminder.domains.forEach(domain => allDomains.add(domain));
        }
      });
    }
    
    if (config.weeklyLimits) {
      config.weeklyLimits.forEach(limit => {
        if (limit.domains) {
          limit.domains.forEach(domain => allDomains.add(domain));
        }
      });
    }

    return Array.from(allDomains);
  }

  /**
   * 检查扩展上下文是否有效
   * 扩展被重载/更新后，旧页面中残留的脚本上下文会失效，任何 chrome API 调用都会抛错
   * @returns {boolean}
   */
  static isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch {
      return false;
    }
  }

  /**
   * 加载用户配置
   * @returns {Object} - 用户配置对象
   */
  static async loadConfig() {
    try {
      // 扩展上下文已失效时直接返回空配置，避免存储API报错刷屏
      if (!AwareMeUtils.isExtensionContextValid()) {
        return {
          visitReminders: [],
          weeklyLimits: []
        };
      }
      const result = await chrome.storage.local.get(['userConfig']);
      if (result.userConfig) {
        console.log('加载用户配置成功');
        return result.userConfig;
      } else {
        console.log('用户配置不存在，尝试加载默认配置');
        // 尝试加载默认配置
        try {
          const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
          if (response.ok) {
            const defaultConfig = await response.json();
            console.log('加载默认配置成功');
            return defaultConfig;
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch (fetchError) {
          console.warn('默认配置文件不存在或加载失败，返回空配置:', fetchError.message);
          // 返回空配置，这样插件仍然可以正常工作，只是没有任何规则
          return {
            visitReminders: [],
            weeklyLimits: []
          };
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      // 返回空配置而不是null，确保插件可以继续工作
      return {
        visitReminders: [],
        weeklyLimits: []
      };
    }
  }
}

// 数据统计工具类
class AwareMeStats {
  /**
   * 获取今日访问次数
   * @param {string} domain - 域名
   * @returns {number} - 访问次数
   */
  static async getTodayVisits(domain) {
    try {
      const today = new Date().toDateString();
      const visitKey = `visits_${today}`;
      
      const result = await chrome.storage.local.get([visitKey]);
      const visits = result[visitKey] || {};
      return visits[domain] || 0;
    } catch (error) {
      console.error('获取今日访问次数失败:', error);
      return 0; // 出错时返回默认值
    }
  }

  /**
   * 获取本周访问天数
   * @param {string} domain - 域名
   * @returns {number} - 访问天数
   */
  static async getWeeklyVisitDays(domain) {
    try {
      const { monday, sunday } = AwareMeUtils.getWeekRange();
      let visitedDays = 0;

      // 从周一到周日遍历每一天
      for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
        const dateKey = `visits_${d.toDateString()}`;
        try {
          const result = await chrome.storage.local.get([dateKey]);
          const visits = result[dateKey] || {};
          if (visits[domain] && visits[domain] > 0) {
            visitedDays++;
          }
        } catch (dayError) {
          console.warn(`获取${d.toDateString()}访问数据失败:`, dayError);
          // 单日数据获取失败不影响其他日期的统计
        }
      }

      return visitedDays;
    } catch (error) {
      console.error('获取本周访问天数失败:', error);
      return 0; // 出错时返回默认值
    }
  }

  /**
   * 获取域名组的本周访问天数
   * @param {Array} domains - 域名数组
   * @returns {number} - 访问天数
   */
  static async getWeeklyVisitDaysForGroup(domains) {
    try {
      if (!domains || domains.length === 0) {
        return 0;
      }
      
      const { monday, sunday } = AwareMeUtils.getWeekRange();
      let visitedDays = 0;

      // 从周一到周日遍历每一天
      for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
        const dateKey = `visits_${d.toDateString()}`;
        try {
          const result = await chrome.storage.local.get([dateKey]);
          const visits = result[dateKey] || {};
          
          // 检查当天是否有访问组内任何域名（支持关键词模糊匹配）
          const hasVisitedAnyDomain = domains.some(pattern => {
            return AwareMeUtils.fuzzyAnyByPattern(visits, pattern);
          });
          
          if (hasVisitedAnyDomain) {
            visitedDays++;
          }
        } catch (dayError) {
          console.warn(`获取${d.toDateString()}组访问数据失败:`, dayError);
          // 单日数据获取失败不影响其他日期的统计
        }
      }

      return visitedDays;
    } catch (error) {
      console.error('获取域名组本周访问天数失败:', error);
      return 0; // 出错时返回默认值
    }
  }

  /**
   * 记录访问
   * @param {string} domain - 域名
   */
  static async recordVisit(domain) {
    try {
      const today = new Date().toDateString();
      const visitKey = `visits_${today}`;
      
      const result = await chrome.storage.local.get([visitKey]);
      const visits = result[visitKey] || {};
      visits[domain] = (visits[domain] || 0) + 1;
      
      console.log(`记录访问: ${domain}, 日期: ${today}, 次数: ${visits[domain]}`);
      
      await chrome.storage.local.set({ [visitKey]: visits });
    } catch (error) {
      console.error('记录访问失败:', error);
      // 记录失败不应该影响页面正常访问
    }
  }

  /**
   * 获取所有访问统计数据
   * @returns {Object} - 包含访问数据的对象
   */
  static async getAllStats() {
    const allStorageData = await chrome.storage.local.get();
    const visitData = {};
    const domains = new Set();
    
    // 处理所有数据
    for (const [key, value] of Object.entries(allStorageData)) {
      if (key.startsWith('visits_')) {
        visitData[key] = value;
        // 收集所有域名
        for (const domain of Object.keys(value)) {
          domains.add(domain);
        }
      }
    }
    
    return { visitData, domains: Array.from(domains) };
  }

  /**
   * 清理非本周的访问记录
   * @returns {Object} - 清理结果统计
   */
  static async cleanupOldRecords() {
    console.log('开始清理非本周的访问记录');
    
    const { monday, sunday } = AwareMeUtils.getWeekRange();
    const allStorageData = await chrome.storage.local.get();
    const keysToDelete = [];
    let visitRecordsDeleted = 0;
    
    // 生成本周所有日期的字符串集合
    const thisWeekDates = new Set();
    for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
      thisWeekDates.add(d.toDateString());
    }
    
    // 检查所有存储的键
    for (const key of Object.keys(allStorageData)) {
      if (key.startsWith('visits_')) {
        // 提取日期部分
        const dateStr = key.replace('visits_', '');
        if (!thisWeekDates.has(dateStr)) {
          keysToDelete.push(key);
          visitRecordsDeleted++;
          console.log(`标记删除访问记录: ${key} (日期: ${dateStr})`);
        }
      } else if (key.startsWith('weekly_')) {
        // 清理旧的周访问跟踪记录
        // weekly_${domain}_${weekStart} 格式
        const parts = key.split('_');
        if (parts.length >= 3) {
          const weekStartStr = parts.slice(2).join('_');
          const weekStartDate = new Date(weekStartStr);
          // 如果不是当前周的记录，删除
          if (weekStartDate.getTime() !== monday.getTime()) {
            keysToDelete.push(key);
            console.log(`标记删除周访问跟踪记录: ${key}`);
          }
        }
      }
    }
    
    // 批量删除
    if (keysToDelete.length > 0) {
      await chrome.storage.local.remove(keysToDelete);
      console.log(`清理完成，删除了 ${keysToDelete.length} 条记录`);
    } else {
      console.log('没有需要清理的记录');
    }
    
    return {
      totalDeleted: keysToDelete.length,
      visitRecordsDeleted,
      weeklyRecordsDeleted: keysToDelete.length - visitRecordsDeleted
    };
  }
}

// 如果在浏览器环境中，将工具类添加到全局
if (typeof window !== 'undefined') {
  window.AwareMeUtils = AwareMeUtils;
  window.AwareMeStats = AwareMeStats;
}

// 如果在Node.js环境中，导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AwareMeUtils, AwareMeStats };
}