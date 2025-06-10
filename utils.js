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
    
    if (config.durationLimits) {
      config.durationLimits.forEach(limit => {
        if (limit.domains) {
          allConfiguredDomains.push(...limit.domains);
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

    // 检查当前域名是否匹配任何配置的域名
    return allConfiguredDomains.some(configDomain => domain.includes(configDomain));
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
    
    if (config.durationLimits) {
      config.durationLimits.forEach(limit => {
        if (limit.domains) {
          limit.domains.forEach(domain => allDomains.add(domain));
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
   * 加载用户配置
   * @returns {Object} - 用户配置对象
   */
  static async loadConfig() {
    try {
      const result = await chrome.storage.local.get(['userConfig']);
      if (result.userConfig) {
        return result.userConfig;
      } else {
        // 加载默认配置
        const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
        return await response.json();
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      return null;
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
    const today = new Date().toDateString();
    const visitKey = `visits_${today}`;
    
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    return visits[domain] || 0;
  }

  /**
   * 获取今日浏览时长
   * @param {string} domain - 域名
   * @returns {number} - 浏览时长（毫秒）
   */
  static async getTodayDuration(domain) {
    const today = new Date().toDateString();
    const durationKey = `duration_${today}`;
    
    const result = await chrome.storage.local.get([durationKey]);
    const durations = result[durationKey] || {};
    return durations[domain] || 0;
  }

  /**
   * 获取本周访问天数
   * @param {string} domain - 域名
   * @returns {number} - 访问天数
   */
  static async getWeeklyVisitDays(domain) {
    const { monday, sunday } = AwareMeUtils.getWeekRange();
    let visitedDays = 0;

    // 从周一到周日遍历每一天
    for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
      const dateKey = `visits_${d.toDateString()}`;
      const result = await chrome.storage.local.get([dateKey]);
      const visits = result[dateKey] || {};
      if (visits[domain] && visits[domain] > 0) {
        visitedDays++;
      }
    }

    return visitedDays;
  }

  /**
   * 获取域名组的本周访问天数
   * @param {Array} domains - 域名数组
   * @returns {number} - 访问天数
   */
  static async getWeeklyVisitDaysForGroup(domains) {
    const { monday, sunday } = AwareMeUtils.getWeekRange();
    let visitedDays = 0;

    // 从周一到周日遍历每一天
    for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
      const dateKey = `visits_${d.toDateString()}`;
      const result = await chrome.storage.local.get([dateKey]);
      const visits = result[dateKey] || {};
      
      // 检查当天是否有访问组内任何域名
      const hasVisitedAnyDomain = domains.some(domain => {
        return visits[domain] && visits[domain] > 0;
      });
      
      if (hasVisitedAnyDomain) {
        visitedDays++;
      }
    }

    return visitedDays;
  }

  /**
   * 获取域名组的今日总浏览时长
   * @param {Array} domains - 域名数组
   * @returns {number} - 总浏览时长（毫秒）
   */
  static async getTodayDurationForGroup(domains) {
    const today = new Date().toDateString();
    const durationKey = `duration_${today}`;
    
    const result = await chrome.storage.local.get([durationKey]);
    const durations = result[durationKey] || {};
    
    let totalDuration = 0;
    domains.forEach(domain => {
      totalDuration += durations[domain] || 0;
    });
    
    return totalDuration;
  }

  /**
   * 记录访问
   * @param {string} domain - 域名
   */
  static async recordVisit(domain) {
    const today = new Date().toDateString();
    const visitKey = `visits_${today}`;
    
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    visits[domain] = (visits[domain] || 0) + 1;
    
    console.log(`记录访问: ${domain}, 日期: ${today}, 次数: ${visits[domain]}`);
    
    await chrome.storage.local.set({ [visitKey]: visits });
  }

  /**
   * 获取所有统计数据
   * @returns {Object} - 包含访问和时长数据的对象
   */
  static async getAllStats() {
    const allStorageData = await chrome.storage.local.get();
    const visitData = {};
    const durationData = {};
    const domains = new Set();
    
    // 处理所有数据
    for (const [key, value] of Object.entries(allStorageData)) {
      if (key.startsWith('visits_')) {
        visitData[key] = value;
        // 收集所有域名
        for (const domain of Object.keys(value)) {
          domains.add(domain);
        }
      } else if (key.startsWith('duration_')) {
        durationData[key] = value;
      }
    }
    
    return { visitData, durationData, domains: Array.from(domains) };
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