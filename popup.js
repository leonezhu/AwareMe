// AwareMe 弹出窗口脚本

class AwareMePopup {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadStats();
    await this.loadCurrentSite();
    this.bindEvents();
  }

  async loadStats() {
    try {
      // 获取今日统计数据
      const today = new Date().toDateString();
      const [visitResult, durationResult, reminderResult] = await Promise.all([
        chrome.storage.local.get([`visits_${today}`]),
        chrome.storage.local.get([`duration_${today}`]),
        chrome.storage.local.get([`reminders_${today}`])
      ]);

      const visits = visitResult[`visits_${today}`] || {};
      const durations = durationResult[`duration_${today}`] || {};
      const reminders = reminderResult[`reminders_${today}`] || 0;

      // 更新UI
      document.getElementById('todayReminders').textContent = reminders;
      document.getElementById('todaySites').textContent = Object.keys(visits).length;

      // 获取本周访问最多的网站
      const topSite = await this.getTopSiteThisWeek();
      document.getElementById('topSite').textContent = topSite || '无';

    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }

  async loadCurrentSite() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url) {
        const domain = this.extractDomain(tabs[0].url);
        if (domain && !domain.startsWith('chrome')) {
          document.getElementById('currentSite').style.display = 'block';
          document.getElementById('currentDomain').textContent = domain;

          // 获取今日在该网站的浏览时长
          const todayDuration = await this.getTodayDuration(domain);
          const minutes = Math.round(todayDuration / (1000 * 60));
          document.getElementById('currentTime').textContent = `今日浏览: ${minutes} 分钟`;
        }
      }
    } catch (error) {
      console.error('加载当前网站信息失败:', error);
    }
  }

  async getTopSiteThisWeek() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const siteVisits = {};

    for (let d = new Date(weekAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateKey = `visits_${d.toDateString()}`;
      const result = await chrome.storage.local.get([dateKey]);
      const visits = result[dateKey] || {};
      
      for (const [domain, count] of Object.entries(visits)) {
        siteVisits[domain] = (siteVisits[domain] || 0) + count;
      }
    }

    let topSite = '';
    let maxVisits = 0;
    for (const [domain, visits] of Object.entries(siteVisits)) {
      if (visits > maxVisits) {
        maxVisits = visits;
        topSite = domain;
      }
    }

    return topSite;
  }

  async getTodayDuration(domain) {
    const today = new Date().toDateString();
    const durationKey = `duration_${today}`;
    
    const result = await chrome.storage.local.get([durationKey]);
    const durations = result[durationKey] || {};
    return durations[domain] || 0;
  }

  bindEvents() {
    // 打开设置页面
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // 暂停提醒
    document.getElementById('pauseReminders').addEventListener('click', async () => {
      const pauseUntil = Date.now() + 60 * 60 * 1000; // 1小时后
      await chrome.storage.local.set({ pauseUntil });
      
      const btn = document.getElementById('pauseReminders');
      btn.textContent = '已暂停提醒';
      btn.disabled = true;
      
      setTimeout(() => {
        window.close();
      }, 1000);
    });

    // 清除数据
    document.getElementById('clearData').addEventListener('click', async () => {
      if (confirm('确定要清除所有统计数据吗？此操作不可恢复。')) {
        await this.clearAllData();
        
        const btn = document.getElementById('clearData');
        btn.textContent = '数据已清除';
        btn.disabled = true;
        
        // 重新加载统计数据
        setTimeout(() => {
          this.loadStats();
          btn.textContent = '清除数据';
          btn.disabled = false;
        }, 1500);
      }
    });
  }

  async clearAllData() {
    try {
      // 获取所有存储的键
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      
      for (const key of Object.keys(allData)) {
        if (key.startsWith('visits_') || 
            key.startsWith('duration_') || 
            key.startsWith('reminders_') ||
            key.startsWith('cooldown_')) {
          keysToRemove.push(key);
        }
      }
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error('清除数据失败:', error);
    }
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

// 检查是否处于暂停状态
async function checkPauseStatus() {
  const result = await chrome.storage.local.get(['pauseUntil']);
  if (result.pauseUntil && Date.now() < result.pauseUntil) {
    const remainingTime = Math.ceil((result.pauseUntil - Date.now()) / (1000 * 60));
    const btn = document.getElementById('pauseReminders');
    btn.textContent = `提醒已暂停 (${remainingTime}分钟)`;
    btn.disabled = true;
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new AwareMePopup();
  checkPauseStatus();
});